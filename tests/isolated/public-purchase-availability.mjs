/**
 * Offline source/fake check: rtk proxy node tests/isolated/public-purchase-availability.mjs
 * Executable closure: this file and Node fs/assert/vm only. Reads the five named
 * frontend source/config files; no product imports, dependency loader, backend,
 * network, providers, credentials, browser or subprocesses. JSX wiring and render
 * precedence are source assertions, not mounted React/SSR acceptance.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const page = read('app/listings/[slug]/page.tsx');
const panel = read('components/ListingPurchasePanel.tsx');
const buy = read('components/BuyButton.tsx');
const legacyTest = read('app/listings/[slug]/public-reference.test.tsx');
const config = read('vitest.config.ts'); // inspected only; never loaded as config
let checks = 0;
function check(name, body) {
  body();
  checks++;
  console.log(`PASS ${name}`);
}
function capture(source, pattern) {
  const match = source.match(pattern);
  assert.ok(match, `Missing source contract: ${pattern}`);
  return match[1];
}
function evaluate(expression, fakes) {
  return runInNewContext(expression, Object.assign(Object.create(null), fakes), {
    timeout: 100, contextCodeGeneration: { strings: false, wasm: false },
  });
}
const reasonExpression = capture(page, /const purchaseDisabledReason = ([\s\S]*?);/);
const reasonFor = listing => evaluate(reasonExpression, { listing });
const hold = 'listing_publication_unavailable';
const message = 'This listing is currently unavailable for new purchases.';
const panelReason = capture(panel, /const disabledReason = ([\s\S]*?);/);
const panelProps = capture(page, /<ListingPurchasePanel\s([\s\S]*?)\/>/);
const buyProps = capture(page, /<BuyButton\s([\s\S]*?)\/>/);

for (const [name, props] of [['versioned', panelProps], ['unversioned', buyProps]]) {
  check(`${name}: exact reason reaches retained purchase component`, () => {
    assert.match(props, /disabledReason=\{purchaseDisabledReason\}/);
    assert.match(props, /listingId=\{listing.id\}/);
    assert.match(props, /price=\{listing.pricing.price\}/);
  });
  // Fake API projections, not execution of backend row/publication predicates.
  for (const publication of ['published-not-listed', 'unlisted', 'missing-status', 'missing-listed']) {
    check(`${name}: ${publication} explicit API refusal disables new purchase`, () => {
      assert.equal(reasonFor({ purchasable: false, purchase_hold_reason: hold }), message);
    });
  }
  for (const purchasable of [true, false, undefined]) {
    for (const purchase_hold_reason of [null, undefined, 'seller_security_hold', 'workspace_sales_paused', 'public_source_reference', 'generated_sample_display_only']) {
      check(`${name}: preserves ${String(purchasable)} / ${String(purchase_hold_reason)}`, () => {
        assert.equal(reasonFor({ purchasable, purchase_hold_reason }), undefined);
      });
    }
  }
}
check('hold alone fails closed even if boolean is stale', () => {
  assert.equal(reasonFor({ purchasable: true, purchase_hold_reason: hold }), message);
});
check('version panel compatible prop, active version and provenance precedence', () => {
  assert.match(panel, /disabledReason\?: string;/);
  assert.match(panel, /disabledReason: listingDisabledReason,/);
  assert.equal(evaluate(panelReason, { selectedVersion: { status: 'active' }, listingDisabledReason: message }), message);
  assert.equal(evaluate(panelReason, { selectedVersion: { status: 'active' }, listingDisabledReason: undefined }), undefined);
  assert.equal(evaluate(panelReason, { selectedVersion: { status: 'superseded' }, listingDisabledReason: message }),
    'This version has been superseded and is shown for provenance only.');
  assert.match(panel, /disabledReason=\{disabledReason\}/);
  assert.match(panel, /versionId=\{selectedVersion\?\.status === 'active' \? selectedVersion.version_id : undefined\}/);
  assert.match(panel, /Visible for provenance\. Not purchasable\./);
});

// Execute the unchanged checkout admission prefix. No TypeScript syntax or I/O;
// its identity and ref comparisons run against local fakes, with no module load.
const admission = capture(buy, /const startCheckout = async \(\) => \{([\s\S]*?)\/\/ Dedupe guard/);
function admitted(overrides = {}) {
  const visit = { context: 'visit' };
  return evaluate(`(() => { ${admission}\nreturn true; })()`, {
    checkoutVisit: { current: visit }, visitContext: 'visit', recoveryOnly: false,
    disabledReason: message, domainEnabled: true, requestIdentity: 'buyer:listing:version',
    acceptedRequest: { current: null }, ...overrides,
  }) === true;
}
check('fresh checkout blocked with explicit disabled reason', () => assert.equal(admitted(), false));
check('legacy fresh checkout also blocked', () => assert.equal(admitted({ domainEnabled: false }), false));
check('eligible ordinary checkout guard remains open', () => assert.equal(admitted({ disabledReason: undefined }), true));
check('accepted checkout with same identity retains retry admission', () => {
  assert.equal(admitted({ acceptedRequest: { current: { identity: 'buyer:listing:version' } } }), true);
});
check('different accepted identity cannot bypass availability', () => {
  assert.equal(admitted({ acceptedRequest: { current: { identity: 'other:listing:version' } } }), false);
});
check('recovery-only and stale-visit guards stay authoritative', () => {
  assert.equal(admitted({ recoveryOnly: true }), false);
  assert.equal(admitted({ recoveryOnly: true, acceptedRequest: { current: { identity: 'buyer:listing:version' } } }), true);
  assert.equal(admitted({ checkoutVisit: { current: null } }), false);
  assert.equal(admitted({ visitContext: 'different' }), false);
});
check('accepted recovery render precedes existing order and fresh controls', () => {
  const recovery = buy.indexOf('if (domainEnabled && processingIdentity === requestIdentity) return');
  const purchased = buy.indexOf('if (purchasedOrder)');
  const fresh = buy.indexOf('if (licenseDetails) {', purchased);
  assert.ok(recovery > 0 && recovery < purchased && purchased < fresh);
  const retry = buy.slice(recovery, purchased);
  assert.match(retry, /onClick=\{startCheckout\}/);
  assert.match(retry, /disabled=\{loading \|\| !!checkoutRefusal\?\.blocked\}/);
  assert.doesNotMatch(retry, /disabledReason/);
  assert.match(buy, /acceptedRequest.current\?\.identity === requestIdentity/);
  assert.match(buy, /saveCheckoutReplay\(requestIdentity/);
  assert.match(buy, /createCheckout\(listingId, versionId, request.acceptance, request.options\)/);
});
check('owner, existing buyer and signed-out unavailable presentation remain', () => {
  assert.match(buy, /if \(isOwner\) \{[\s\S]*?This is your listing/);
  const purchased = capture(buy, /if \(purchasedOrder\) \{([\s\S]*?)if \(recoveryOnly\)/);
  assert.match(purchased, /href=\{`\/dashboard\/orders\/\$\{purchasedOrder.id\}`\}/);
  assert.match(purchased, /'Access Data' : 'View purchase'/);
  assert.doesNotMatch(purchased, /disabledReason/);
  assert.match(buy, /if \(!isAuthenticated\) \{\s*if \(disabledReason\) \{[\s\S]*?<DisabledBuyButton price=\{price\} reason=\{disabledReason\}/);
  assert.match(buy, /function DisabledBuyButton[\s\S]*?<button[\s\S]*?disabled[\s\S]*?\{reason\}/);
  assert.equal((buy.match(/disabled=\{[^\n]*!!disabledReason/g) || []).length, 2);
  assert.match(buy, /\{disabledReason && <p[\s\S]*?\{disabledReason\}/);
});
check('special markers, workspace and pending Terms retain earlier branches', () => {
  const decision = page.indexOf('const purchaseDisabledReason');
  assert.ok(page.indexOf("if (generatedSampleState(listing) !== 'ordinary')") < decision);
  assert.ok(page.indexOf('if (isPublicSourceReference(listing))') < decision);
  assert.match(page, /pendingSellerTerms \? null : approved && !listing.purchasable \?[\s\S]*?workspace_sales_paused[\s\S]*?: hasVersionRows \?/);
  assert.match(page, /Not yet available to buy\. The seller needs to accept the current terms\./);
  assert.match(legacyTest, /retains the existing path for ordinary/);
  assert.match(legacyTest, /purchase_hold_reason: null, purchasable/);
  assert.match(config, /environment: 'node'/);
});
console.log(`PASS ${checks} source/fake checks; no product imports or product I/O. React/SSR/full suite not executed.`);
