// Selected-component regression only. No application, API, auth, or renderer imports.
// Run with Node 24 and --deps pointing to an existing React/TypeScript/jsdom install.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const deps = option('--deps');
assert.ok(deps, '--deps must name an existing dependency directory');
const source = path.resolve(option('--source', __dirname));
const resourcesFile = path.resolve(__dirname, '../../lib/i18n/anonymous-allai.ts');
const React = require(path.join(deps, 'react'));
const jsx = require(path.join(deps, 'react/jsx-runtime'));
const ts = require(path.join(deps, 'typescript'));
const { JSDOM } = require(path.join(deps, 'jsdom'));
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.invalid/support' });
Object.assign(global, { window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true });
const refuse = () => { throw Error('Unmocked operation refused'); };
global.fetch = dom.window.fetch = refuse;
dom.window.XMLHttpRequest.prototype.open = refuse;
for (const name of ['node:http', 'node:https']) {
  const port = require(name); port.request = refuse; port.get = refuse;
}
const { createRoot } = require(path.join(deps, 'react-dom/client'));
// Read existing translations as literal data; do not execute another actual module.
const resourceAst = ts.createSourceFile(resourcesFile, fs.readFileSync(resourcesFile, 'utf8'), ts.ScriptTarget.Latest, true);
let resourceNode;
function findResources(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(resourceAst) === 'ANONYMOUS_ALLAI_RESOURCES') resourceNode = node.initializer;
  ts.forEachChild(node, findResources);
}
findResources(resourceAst);
function literal(node) {
  if (ts.isStringLiteral(node)) return node.text;
  assert.ok(ts.isObjectLiteralExpression(node), 'resources must remain literal data');
  return Object.fromEntries(node.properties.map(prop => [prop.name.text, literal(prop.initializer)]));
}
const translations = literal(resourceNode);
const locales = ['en', 'es', 'zh-Hans'];
const i18n = { ANONYMOUS_ALLAI_LOCALES: locales, preferredAnonymousAllAILocale: () => 'en',
  anonymousAllAIResources: locale => translations[locale] };
const act = fn => React.act(async () => { await fn?.(); for (let i = 0; i < 20; i++) await Promise.resolve(); });
function load(file, ports, fetchPort) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(source, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.deepEqual(compiled.diagnostics, []);
  const loadedModule = { exports: {} };
  vm.runInNewContext(compiled.outputText, { module: loadedModule, exports: loadedModule.exports,
    require: name => { assert.ok(Object.hasOwn(ports, name), `Denied import ${name}`); return ports[name]; },
    process: { env: {} }, sessionStorage, navigator: { language: 'en' }, document,
    HTMLElement, requestAnimationFrame: fn => fn(), fetch: fetchPort, AbortController,
    Error, DOMException, console, Date, setTimeout, clearTimeout }, { filename: file });
  return loadedModule.exports;
}
async function mount({ locale = 'en', mode = 'eof', partial = 'Useful partial answer', publicRoute = false, history = false } = {}) {
  sessionStorage.clear();
  if (history) sessionStorage.setItem('allai-session-id', 'synthetic-history');
  let context, creations = 0, reads = 0, restores = 0;
  const calls = [], state = { pathname: publicRoute ? '/' : '/support', auth: { user: null, token: null }, mode };
  const api = {
    createAnonymousSession: async () => `synthetic-session-${++creations}`,
    getAnonymousChatStatus: async () => ({ available: true, supported_locales: locales, cache_seconds: 3600 }),
    sendAnonymousMessage: async (payload, options) => {
      calls.push({ payload, options });
      const status = state.mode === '404' && calls.length === 1 ? 404
        : ['429', '503'].includes(state.mode) ? Number(state.mode) : 200;
      return { ok: status === 200, status, body: {} };
    },
    readAnonymousMessageStream: async (_body, event) => {
      reads++;
      if (state.mode === 'close') {
        event({ type: 'delta', chunk: partial });
        await new Promise((_, reject) => calls.at(-1).options.signal.addEventListener('abort', () => reject(Object.assign(Error('private abort'), { name: 'AbortError' }))));
        return;
      }
      if (state.mode === 'events') {
        event({ type: 'answer', text: 'Validated answer', source_revision_set: 'revision', next_step: { action: 'browse_listings', label: 'Browse', url: '/listings', requires_account: false } });
        event({ type: 'field_proposal', field: 'title', value: 'Draft', reasoning: 'Reason' });
        event({ type: 'batch_proposal', proposals: [{ field: 'description', value: 'Draft', reasoning: 'Reason' }] });
        event({ type: 'ticket_status', cards: [{ public_ref: 'synthetic', status: 'open', priority: 'normal', issue_class: 'question', collapsed: true, updated_at: 'synthetic', last_ticket_message_at: null }] });
        return;
      }
      if (state.mode === 'safe') { event({ type: 'safe_failure', outcome: 'answer_unverified' }); return; }
      if (state.mode === 'error-event') { event({ type: 'error', message: 'Existing meaningful event error' }); return; }
      if (state.mode !== 'empty') event({ type: 'delta', chunk: partial });
      if (['network', 'empty', 'timeout'].includes(state.mode)) throw Error(state.mode === 'timeout' ? 'Stream read timeout' : 'private read exception');
      if (state.mode === 'abort') throw Object.assign(Error('private abort'), { name: 'AbortError' });
    },
  };
  const fetchPort = async url => {
    assert.equal(url, 'http://localhost:8000/api/allai/support/anonymous/session/synthetic-history');
    restores++; return { ok: true, json: async () => ({ messages: [{ role: 'assistant', content: 'Earlier answer' }] }) };
  };
  const common = { react: React, 'react/jsx-runtime': jsx, '@/lib/i18n/anonymous-allai': i18n };
  const provider = load('AllAIContext.tsx', { ...common, 'next/navigation': { usePathname: () => state.pathname },
    '@/store/auth': { useAuthStore: () => state.auth }, '@/api/anonymousChat': api }, fetchPort);
  const message = load('AllAIMessage.tsx', { ...common, './AllAIContext': provider,
    // Mark the Markdown boundary, including unfinished fences/lists, without importing its renderer.
    'react-markdown': { __esModule: true, default: props => React.createElement('div', { 'data-fake-markdown': true }, props.children) },
    './TicketStatusCard': { __esModule: true, default: () => null },
    './AllAINextStep': { __esModule: true, default: () => null } }, fetchPort);
  function Probe() {
    context = provider.useAllAI();
    return React.createElement('div', null, context.messages.map((m, i) => React.createElement(message.default, {
      key: i, message: m, isStreaming: context.isStreaming && i === context.messages.length - 1,
    })));
  }
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  const render = () => root.render(React.createElement(provider.AllAIProvider, null, React.createElement(Probe)));
  await act(render); await act(() => context.setLocale(locale));
  return { state, calls, container, context: () => context, counts: () => ({ creations, reads, restores }),
    send: () => context.sendMessage('Synthetic question'), rerender: () => act(render),
    dispose: async () => { await act(() => root.unmount()); container.remove(); } };
}
const results = [];
async function test(name, options, verify) {
  let fixture;
  try { fixture = await mount(options); await verify(fixture); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: error.stack }); }
  finally { if (fixture) await fixture.dispose(); }
}
(async () => {
  for (const locale of locales) {
    for (const mode of ['eof', 'empty', 'network', 'timeout', 'abort']) {
      for (const partial of mode === 'network' || mode === 'timeout' ? ['Useful partial answer', '```js\nUseful partial answer', '- Useful partial answer\n  - unfinished'] : ['Useful partial answer']) {
        await test(`${locale} ${mode} ${JSON.stringify(partial)}`, { locale, mode, partial }, async f => {
          await act(f.send);
          const last = f.context().messages.at(-1), error = translations[locale].genericError;
          const failure = ['empty', 'network', 'timeout'].includes(mode);
          assert.equal(last.content, mode === 'empty' ? error : partial);
          assert.equal(f.container.textContent.includes(error), failure);
          assert.equal(f.container.textContent.includes('private read exception'), false);
          const alerts = f.container.querySelectorAll('[role="alert"]');
          assert.equal(alerts.length, ['network', 'timeout'].includes(mode) ? 1 : 0);
          if (alerts.length) {
            assert.equal(alerts[0].textContent, error);
            assert.equal(alerts[0].closest('[data-fake-markdown]'), null);
            assert.equal(f.container.querySelector('[data-fake-markdown]').textContent, partial);
          }
          assert.equal(f.calls.length, 1); assert.equal(f.context().isStreaming, false);
          assert.equal(f.calls[0].options.signal.aborted, mode === 'timeout');
          f.state.mode = 'eof'; await act(f.send);
          assert.equal(f.calls.length, 2); assert.equal(f.counts().creations, 1);
          assert.equal(f.context().messages.at(-1).failureNotice, undefined);
        });
      }
    }
    for (const mode of ['429', '503', 'safe', 'error-event']) {
      await test(`${locale} ${mode}`, { locale, mode, publicRoute: true }, async f => {
        await act(f.send);
        const expected = mode === '429' ? translations[locale].safeOutcomes.rate_limited
          : mode === '503' ? translations[locale].safeOutcomes.surface_disabled
          : mode === 'safe' ? translations[locale].safeOutcomes.answer_unverified : 'Existing meaningful event error';
        assert.equal(f.context().messages.at(-1).content, expected);
        assert.equal(f.container.querySelectorAll('[role="alert"]').length, 0);
        assert.equal(f.context().isStreaming, false); assert.equal(f.calls.length, 1);
        assert.equal(f.counts().reads, ['429', '503'].includes(mode) ? 0 : 1);
        if (mode === '503') { assert.equal(f.context().anonymousAvailable, false); await act(f.send); assert.equal(f.calls.length, 1); }
      });
    }
  }
  await test('intentional close abort stays quiet', { mode: 'close' }, async f => {
    let pending; await act(() => { pending = f.send(); });
    assert.equal(f.context().isStreaming, true);
    await act(() => f.context().close()); await act(() => pending);
    assert.equal(f.calls[0].options.signal.aborted, true);
    assert.equal(f.context().messages.at(-1).content, 'Useful partial answer');
    assert.equal(f.container.querySelector('[role="alert"]'), null);
    assert.equal(f.context().isStreaming, false);
  });
  await test('404 replaces once with original headers/controller', { mode: '404' }, async f => {
    f.state.auth = { user: { role: 'buyer' }, token: 'synthetic-token' }; await f.rerender();
    await act(f.send); assert.equal(f.calls.length, 2); assert.equal(f.counts().creations, 2);
    assert.equal(f.calls[0].options.headers, f.calls[1].options.headers);
    assert.equal(f.calls[0].options.signal, f.calls[1].options.signal);
    assert.equal(f.calls[1].options.headers.Authorization, 'Bearer synthetic-token');
    assert.deepEqual({ ...f.calls[1].payload }, { ...f.calls[0].payload, session_id: 'synthetic-session-2' });
    assert.equal(f.context().messages.at(-1).failureNotice, undefined);
  });
  await test('session/history/locale survive route and sign-in/out changes', { history: true, publicRoute: true }, async f => {
    await act(() => f.context().setLocale('zh-Hans'));
    for (const [pathname, signedIn] of [['/sell-data', false], ['/sell-data', true], ['/find-data', true], ['/find-data', false], ['/listings/example', false]]) {
      f.state.pathname = pathname; f.state.auth = { user: signedIn ? { role: 'buyer' } : null, token: signedIn ? 'synthetic-token' : null };
      await f.rerender(); assert.equal(f.context().anonymousAvailable, true); await act(f.send);
      assert.equal(f.context().locale, 'zh-Hans');
      assert.equal(f.calls.at(-1).payload.session_id, 'synthetic-history');
      assert.equal(f.calls.at(-1).payload.locale, 'zh-Hans');
      assert.equal(f.calls.at(-1).payload.context.page, pathname);
    }
    assert.equal(f.context().messages.length, 11); assert.equal(f.context().messages[0].content, 'Earlier answer');
    assert.equal(f.context().messages[0].historical, true); assert.equal(f.counts().creations, 0); assert.equal(f.counts().restores, 1);
  });
  await test('answer and wizard event contracts', { mode: 'events', publicRoute: true }, async f => {
    const fields = [], batches = [];
    await act(() => { f.context().setOnFieldProposal(value => fields.push(value)); f.context().setOnBatchProposal(value => batches.push(value)); });
    await act(f.send);
    const last = f.context().messages.at(-1);
    assert.equal(last.content, 'Validated answer'); assert.equal(last.factRevisionSet, 'revision');
    assert.equal(last.nextStep.url, '/listings'); assert.equal(fields.length, 1); assert.equal(batches.length, 1);
    assert.equal(last.ticketStatusCards.length, 1); assert.equal(last.failureNotice, undefined);
  });
  console.log(JSON.stringify({ node: process.version, react: React.version, typescript: ts.version,
    source, cases: results.length, passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length, results,
    limits: 'Only actual Context+Message executed in strict VM with explicit fake ports. Translation literals read statically. Markdown boundary tested with a fake renderer; no real Markdown/application/API/auth/backend imports, real network, or live operations. Presentation evidence only, no incidence or delivery proof.' }, null, 2));
  if (results.some(r => !r.passed)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
