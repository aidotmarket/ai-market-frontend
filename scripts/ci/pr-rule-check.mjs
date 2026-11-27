import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { hasRuleAnswers } from './pr-rule-description.mjs';

const nonRuntime = /(?:^|\/)(?:\.github|__tests__|__mocks__|__snapshots__|archive|docs?|evidence|examples?|fixtures?|public|specs?|tests?|testdata|vendor)(?:\/|$)|^scripts\/ci\//i;
const runtimeExtension = /\.[cm]?[jt]sx?$/i;
const testFile = /(?:^|\/)(?:(?:playwright|vitest)\.|[^/]*\.(?:d|test|spec|fixture|mock|fake-port)\.[cm]?[jt]sx?$)/i;
const policyPredicate = /^(?:(?:is|human)?Approved|approvalGranted|has(?:Human)?Approval|isAuthenticated|isAuthorized|hasPermission|hasRequiredProof|proofVerified|requiredProofPresent|verifyProof|checkAuthorization|checkApproval)$/i;
const policyHint = /approv|authoriz|permission|proof|denied|refus|fail_?closed|block|gate|fence/i;
const denialStatus = new Set(['401', '403', '423', '428']);
const denialError = /^(?:PermissionError|AuthorizationError|ForbiddenError|ApprovalRequiredError|ProofRequiredError)$/;
const possibleDenial = /^(?:notFound|redirect|deny(?:Access)?|forbidden|\w*UnavailableResponse|failClosed)$/i;
const printer = ts.createPrinter({ removeComments: true });

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

function* changedSources({ base, head }) {
  for (const sha of [base.sha, head.sha]) {
    if (!/^[a-f0-9]{40}$/.test(sha) || /^0+$/.test(sha)) throw new Error('Invalid PR commit SHA');
  }
  const common = git('merge-base', base.sha, head.sha).trim();
  const diff = git('diff', '--raw', '--no-abbrev', '--no-ext-diff', '--no-renames',
    '--ignore-submodules=all', '-z', common, head.sha, '--').split('\0');
  for (let i = 0; i + 1 < diff.length; i += 2) {
    const path = diff[i + 1];
    if (!runtimeExtension.test(path) || nonRuntime.test(path) || testFile.test(path)) continue;
    const [oldMode, newMode, oldBlob, newBlob] = diff[i].slice(1).split(' ');
    const fileMode = /^(?:000000|100644|100755)$/;
    if (!fileMode.test(oldMode) || !fileMode.test(newMode)) {
      yield { path, advisory: 'could not compare a non-regular source file' };
      continue;
    }
    yield {
      path,
      before: oldMode === '000000' ? '' : git('cat-file', 'blob', oldBlob),
      after: newMode === '000000' ? '' : git('cat-file', 'blob', newBlob),
    };
  }
}

function unwrap(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node) ||
    ts.isAsExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}

function name(node) {
  node = unwrap(node);
  if (node && (ts.isCallExpression(node) || ts.isNewExpression(node))) node = unwrap(node.expression);
  if (node && ts.isPropertyAccessExpression(node)) node = node.name;
  return node && ts.isIdentifier(node) ? node.text : '';
}

function mentionsPolicy(node) {
  return Boolean(node && ((ts.isIdentifier(node) && policyHint.test(node.text)) ||
    ts.forEachChild(node, mentionsPolicy)));
}

function responseStatus(value) {
  if (!value) return undefined;
  const target = value.expression;
  const response = (ts.isNewExpression(value) && /^(?:NextResponse|Response)$/.test(name(target))) ||
    (ts.isCallExpression(value) && ts.isPropertyAccessExpression(target) &&
      target.name.text === 'json' && /^(?:NextResponse|Response)$/.test(name(target.expression)));
  const options = response && unwrap(value.arguments?.[1]);
  if (!options || !ts.isObjectLiteralExpression(options)) return undefined;
  // A trailing spread or computed property can override a literal status.
  for (const property of [...options.properties].reverse()) {
    if (!property.name || ts.isComputedPropertyName(property.name)) return undefined;
    if (property.name.text === 'status') {
      if (ts.isPropertyAssignment(property) && ts.isNumericLiteral(unwrap(property.initializer))) {
        return String(Number(unwrap(property.initializer).text));
      }
      return undefined;
    }
  }
}

function outcome(node) {
  if (ts.isThrowStatement(node)) {
    const error = unwrap(node.expression);
    return {
      family: 'throw',
      effect: name(error) || 'throw',
      explicit: ts.isNewExpression(error) && denialError.test(name(error)),
    };
  }
  const value = unwrap(ts.isReturnStatement(node) || ts.isExpressionStatement(node) ? node.expression : node);
  const status = ts.isExpressionStatement(node) ? undefined : responseStatus(value);
  if (denialStatus.has(status)) return { family: 'response', effect: status, explicit: true };
  if (possibleDenial.test(name(value)) && value && ts.isCallExpression(value)) {
    return { family: 'response', effect: name(value) };
  }
  if (!value || [ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(value.kind) ||
    (ts.isIdentifier(value) && value.text === 'undefined')) return { family: 'exit', effect: 'empty exit' };
}

function branchStatements(statement) {
  return ts.isBlock(statement) ? statement.statements : [statement];
}

function guardedCondition(condition, inverted) {
  condition = unwrap(condition);
  while (ts.isPrefixUnaryExpression(condition) && condition.operator === ts.SyntaxKind.ExclamationToken) {
    inverted = !inverted;
    condition = unwrap(condition.operand);
  }
  return { condition, inverted };
}

function findings(path, source) {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  if (tree.parseDiagnostics.length) return null;
  const result = [];

  function add(node, family, effect, condition, confirmed) {
    const signature = JSON.stringify([family, effect, condition]);
    const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
    result.push({ path, line, family, signature, confirmed, effect });
  }

  function print(node) {
    return printer.printNode(ts.EmitHint.Expression, node, tree);
  }

  function guard(node, test, inverted) {
    const action = outcome(node);
    if (!action) return;
    const condition = guardedCondition(test, inverted);
    if (!action.explicit && !mentionsPolicy(condition.condition)) return;
    const confirmed = action.explicit === true && condition.inverted && policyPredicate.test(name(condition.condition));
    add(node, action.family, action.effect, (condition.inverted ? '!' : '') + print(condition.condition), confirmed);
  }

  function visit(node) {
    if (ts.isIfStatement(node)) {
      for (const [branch, inverted] of [[node.thenStatement, false], [node.elseStatement, true]]) {
        if (!branch) continue;
        for (const statement of branchStatements(branch)) {
          if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement) || ts.isExpressionStatement(statement)) {
            guard(statement, node.expression, inverted);
          }
        }
      }
    }
    if (ts.isConditionalExpression(node) && (ts.isReturnStatement(node.parent) || ts.isArrowFunction(node.parent))) {
      guard(node.whenTrue, node.condition, false);
      guard(node.whenFalse, node.condition, true);
    }
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'disabled' &&
      /^(?:button|input|fieldset|select|textarea)$/.test(node.parent.parent.tagName.getText(tree)) &&
      node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
      const { condition, inverted } = guardedCondition(node.initializer.expression, false);
      if (mentionsPolicy(condition)) {
        const attributes = node.parent.properties;
        const overridden = attributes.slice(attributes.indexOf(node) + 1).some(attribute =>
          ts.isJsxSpreadAttribute(attribute) || attribute.name.getText(tree) === 'disabled');
        add(node, 'disabled', 'disabled control', print(node.initializer.expression),
          !overridden && inverted && policyPredicate.test(name(condition)));
      }
    }
    if (ts.isTryStatement(node) && node.catchClause) {
      const policyCall = node.tryBlock.statements.map(statement => unwrap(
        ts.isExpressionStatement(statement) || ts.isReturnStatement(statement) ? statement.expression : undefined,
      )).find(value => value && ts.isCallExpression(value) && policyPredicate.test(name(value)));
      for (const statement of node.catchClause.block.statements) {
        if (!ts.isReturnStatement(statement) && !ts.isThrowStatement(statement)) continue;
        const action = outcome(statement);
        if (action && (action.explicit || action.family === 'response' || policyCall)) {
          add(statement, action.family, action.effect, policyCall ? 'catch ' + print(policyCall) : 'catch',
            Boolean(action.explicit && policyCall));
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'catch' && /^fail_?closed$/i.test(name(node.arguments[0]))) {
      add(node, 'response', 'fail-closed callback', print(node), false);
    }
    ts.forEachChild(node, visit);
  }

  visit(tree);
  return result;
}

function take(items, matches) {
  const index = items.findIndex(matches);
  if (index === -1) return false;
  items.splice(index, 1);
  return true;
}

export function* newFindings(sources) {
  const removed = [];
  const added = [];
  for (const { path, before, after, advisory } of sources) {
    const previous = advisory ? null : findings(path, before);
    const current = advisory ? null : findings(path, after);
    if (!previous || !current) {
      yield { path, effect: advisory || 'could not compare source syntax', confirmed: false };
      continue;
    }
    for (const item of current) {
      if (!take(previous, old => old.signature === item.signature)) added.push(item);
    }
    removed.push(...previous);
  }

  // Match exact moves before pairing possible rewrites, once per removed site.
  const unmatched = added.filter(item => !take(removed, old => old.signature === item.signature));
  const rewrites = new Set();
  for (const sameFile of [true, false]) {
    for (const item of unmatched) {
      if (!item.confirmed || rewrites.has(item)) continue;
      if (take(removed, old => old.family === item.family &&
        (old.confirmed || old.effect === item.effect) &&
        (!sameFile || old.path === item.path))) rewrites.add(item);
    }
  }
  for (const item of unmatched) yield { ...item, confirmed: item.confirmed && !rewrites.has(item) };
}

function check(pr) {
  let confirmed = false;
  for (const item of newFindings(changedSources(pr))) {
    const prefix = item.confirmed ? 'Rule check finding' : 'Rule check review (advisory)';
    const path = item.path.split('/').map(encodeURIComponent).join('/');
    const location = item.line ? `${path}:${item.line}` : path;
    console.log(`${prefix}: ${location}: ${JSON.stringify(item.effect)}.`);
    confirmed ||= item.confirmed;
  }
  if (!confirmed || hasRuleAnswers(pr.body)) return 0;
  console.log('Add the four Rule check answers to the PR description: what harm prompted this, ' +
    'what changes and when, why a narrower approach was insufficient, and who bears the cost. ' +
    'Saving the description reruns this check.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  process.exitCode = check(event.pull_request);
}
