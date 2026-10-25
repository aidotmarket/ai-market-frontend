const fs = require('fs');
const vm = require('vm');
const B = '/Users/max/specs/athena-runbook-system-audit-s1799';
const deps = B + '/reviews/r493-conversation/node_modules';
const React = require(deps + '/react');
const jsx = require(deps + '/react/jsx-runtime');
const ts = require(deps + '/typescript');
const { JSDOM } = require(deps + '/jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.invalid/dashboard' });
Object.assign(global, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const refuse = () => { throw Error('Unmocked operation refused'); };
global.fetch = window.fetch = refuse;
window.XMLHttpRequest.prototype.open = refuse;
for (const name of ['http', 'https']) { const port = require(name); port.request = refuse; port.get = refuse; }
const { createRoot } = require(deps + '/react-dom/client');
const act = fn => React.act(async () => { await fn?.(); for (let i = 0; i < 25; i++) await Promise.resolve(); });
const defer = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const sourceDir = process.argv[2] || process.cwd() + '/app/dashboard';
function load(name, ports, fakeWindow = window) {
  const src = fs.readFileSync(sourceDir + '/' + name, 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const m = { exports: {} };
  vm.runInNewContext(js, { module: m, exports: m.exports, require: key => { if (!Object.hasOwn(ports, key)) throw Error('Denied import ' + key); return ports[key]; }, console: { error: () => {} }, window: fakeWindow, document, navigator: dom.window.navigator, Error, AbortController }, { filename: name });
  return m.exports;
}
class FakeAxiosError extends Error { constructor(status, detail) { super('FAKE_POLICY_ERROR'); this.response = { status, data: { detail } }; } }
const capability = status => ({ seller: { effective_status: status, missing_steps: [] } });
const stats = actor => ({ data: { total_views: actor === 'A' ? 101 : 202, total_sales: actor === 'A' ? 11 : 22, period_revenue_display: actor === 'A' ? '$111.00' : '$222.00', pending_fulfillments: 0 } });
async function mount(plan) {
  let actor = 'A', generation = 0, modal;
  const listeners = new Set();
  const calls = { capabilities: [], stats: [], connect: [], listings: [], purchases: [], forbiddenMutations: 0, router: [] };
  let auth = { user: { id: 'A', first_name: 'Synthetic A', totp_enabled: !plan.security, sso_enforced: !!plan.sso }, token: 'synthetic-A', isAuthenticated: true, isLoading: false, hydrated: true, refreshAuth: () => { calls.refresh = (calls.refresh || 0) + 1; return plan.refresh?.promise || Promise.resolve(); } };
  const useAuthStore = selector => selector ? selector(auth) : auth;
  useAuthStore.subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  useAuthStore.getState = () => auth;
  const forbidden = () => { calls.forbiddenMutations++; return refuse(); };
  const fakeWindow = { addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window), location: { search: '', assign: value => calls.router.push('assign:' + value) } };
  const shared = { react: React, 'react/jsx-runtime': jsx, 'next/link': { __esModule: true, default: p => React.createElement('a', { href: p.href, 'aria-label': p['aria-label'] }, p.children) }, '@/store/auth': { useAuthStore }, '@/lib/auth-session-owner': { authSessionOwner: () => generation } };
  const capsFor = who => ({ seller: { effective_status: plan.status || (who === 'B' && plan.buyerB ? 'not_requested' : 'active'), missing_steps: plan.security ? ['totp_enabled', 'stripe_payouts_live'] : ['stripe_payouts_live'] } });
  const capPort = {
    getCapabilities: () => { calls.capabilities.push(actor); if (plan.capsQueue?.length) return plan.capsQueue.shift().promise; return actor === 'A' && plan.oldCaps ? plan.oldCaps.promise : actor === 'B' && plan.newCaps ? plan.newCaps.promise : Promise.resolve(capsFor(actor)); },
    requestSellerCapability: () => { calls.start = (calls.start || 0) + 1; return plan.start?.promise || Promise.resolve(capsFor(actor)); },
  };
  const otherReads = {
    getConnectStatus: () => { calls.connect.push(actor); return Promise.resolve({ data: { details_submitted: true, payouts_enabled: true } }); },
    getConnectOnboarding: () => { calls.onboard = (calls.onboard || 0) + 1; return plan.connect?.promise || Promise.resolve({ data: 'FAKE_REDIRECT' }); }, isConnectOnboardingTwoFactorRequired: () => true, redirectToConnectOnboarding: value => { calls.redirect = (calls.redirect || 0) + 1; },
  };
  const overview = load('page.tsx', { ...shared,
    '@/lib/two-factor-policy': { accountReauthMethod: () => 'password', setupRestriction: () => null, setupRefusal: err => err instanceof FakeAxiosError && err.response.status === 409 ? 'FAKE_REFUSAL' : null, sellerSecuritySatisfied: () => !plan.security },
    '@/components/CompanyAuthenticator': { companyEnrollmentOffered: () => false },
    '@/api/connect': otherReads,
    '@/api/auth': { setup2FA: () => { calls.setup = (calls.setup || 0) + 1; return plan.setup?.promise || Promise.resolve({ secret: 'FAKE_SECRET_MARKER', qr_uri: 'FAKE_QR_MARKER', expires_in: 30 }); }, verify2FASetup: () => { calls.verify = (calls.verify || 0) + 1; return plan.verify?.promise || Promise.resolve({ backup_codes: ['FAKE_BACKUP_MARKER'] }); }, SSO_MANAGED_2FA_MESSAGE: 'Synthetic managed security' },
    '@/api/seller': { getSellerStats: () => { calls.stats.push(actor); if (actor === 'A' && plan.oldStats && (!plan.oldStatsOnce || calls.stats.length === 1)) return plan.oldStats.promise; if (actor === 'B' && plan.buyerB) return Promise.reject(Error('Synthetic refused seller read')); return Promise.resolve(stats(actor)); } },
    '@/api/listings': { getMyListings: () => { calls.listings.push(actor); return Promise.resolve({ data: [] }); } },
    '@/api/orders': { getMyOrders: () => { calls.purchases.push(actor); return plan.ordersQueue?.length ? plan.ordersQueue.shift().promise : Promise.resolve([]); } },
    '@/api/capabilities': capPort,
    '@/components/onboarding/SellerSetupProgressBar': { notifyCapabilitiesChanged: () => { calls.notify = (calls.notify || 0) + 1; } },
    '@/components/Toast': { useToast: () => ({ toast: (...args) => { (calls.toasts ||= []).push(args); } }) },
    '@/lib/format': { formatDate: () => 'Synthetic date', formatPrice: n => String(n) },
    '@/lib/order-status': { orderStatusPresentation: () => ({ label: 'Synthetic order status' }) },
    axios: { AxiosError: FakeAxiosError },
    './settings/ReauthModal': { __esModule: true, default: props => { modal = props; return null; } },
    '@/components/TotpQrCode': { __esModule: true, default: () => null },
  }, fakeWindow);
  const layout = load('layout.tsx', { ...shared,
    'next/navigation': { usePathname: () => '/dashboard', useRouter: () => ({ push: value => calls.router.push(value) }) },
    '@/api/capabilities': { getCapabilities: () => Promise.resolve(capsFor(actor)) },
    '@/api/sellerWorkspace': { getSellerWorkspaceCapabilities: async () => ({}), isAWSConnectionAvailable: () => false },
    '@/api/sellerGateways': { listSellerGateways: async () => [] },
    '@/components/onboarding/SellerSetupProgressBar': { __esModule: true, default: () => null },
  }, fakeWindow);
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  const render = () => root.render(React.createElement(plan.strict ? React.StrictMode : React.Fragment, null, React.createElement(layout.default, null, React.createElement(overview.default))));
  await act(render);
  const transition = (who, advance = false, lost = false) => {
    actor = who;
    if (advance) generation++;
    auth = { ...auth, user: lost ? null : { ...auth.user, id: who, first_name: 'Synthetic ' + who }, token: lost ? null : 'synthetic-' + who, isAuthenticated: !lost };
    for (const listener of listeners) listener(auth);
  };
  const handler = text => {
    const node = [...element.querySelectorAll('button')].find(x => x.textContent.includes(text));
    if (!node) throw Error('Missing button ' + text);
    return node[Object.keys(node).find(k => k.startsWith('__reactProps'))].onClick;
  };
  return { element, calls, handler, modal: () => modal,
    change: async (who, advance = false, lost = false) => act(() => { transition(who, advance, lost); render(); }),
    coalesce: async () => act(() => { transition('B'); transition('A'); render(); }),
    refresh: async () => act(() => { auth = { ...auth, token: 'FAKE_ROTATED', user: { ...auth.user, last_name: 'refreshed' } }; for (const fn of listeners) fn(auth); render(); }),
    rerender: async () => act(render),
    switchB: async () => act(() => { transition('B'); render(); }),
    dispose: async () => { await act(() => root.unmount()); element.remove(); } };

}
const results = [];
(async () => {
  const normal = await mount({});
  results.push({ name: 'ordinary current seller source contract', passed: normal.element.textContent.includes('$111.00') && normal.element.textContent.includes('Synthetic A') && normal.calls.forbiddenMutations === 0, calls: normal.calls });
  await normal.dispose();
  for (const outcome of ['success', 'error']) {
    const old = defer(); const f = await mount({ oldStats: old });
    await f.switchB();
    const before = f.element.textContent;
    await act(() => outcome === 'success' ? old.resolve(stats('A')) : old.reject(Error('Synthetic old seller failure')));
    const after = f.element.textContent;
    results.push({ name: 'retired seller stats ' + outcome + ' cannot replace settled B', passed: before.includes('$222.00') && after.includes('$222.00') && !after.includes('$111.00') && !after.includes('Failed to load dashboard data') && f.calls.forbiddenMutations === 0, beforeHasB: before.includes('$222.00'), afterHasB: after.includes('$222.00'), afterHasA: after.includes('$111.00'), oldErrorVisible: after.includes('Failed to load dashboard data'), calls: f.calls });
    await f.dispose();
  }
  const cap = defer(); const f = await mount({ oldCaps: cap, buyerB: true });
  await f.switchB(); const before = f.calls.stats.length;
  await act(() => cap.resolve(capability('active')));
  results.push({ name: 'retired A capability read cannot admit seller GETs under buyer B', passed: f.calls.stats.length === before && f.calls.forbiddenMutations === 0 && !f.element.textContent.includes('Failed to load dashboard data'), beforeSellerReads: before, afterSellerReads: f.calls.stats.length, erroneousDashboardFailure: f.element.textContent.includes('Failed to load dashboard data'), calls: f.calls });
  await f.dispose();
  const old = defer(), current = defer(); const pending = await mount({ oldStats: old, newCaps: current });
  await pending.switchB();
  await act(() => old.resolve(stats('A')));
  results.push({ name: 'retired seller completion cannot end current primary loading', passed: !pending.element.textContent.includes('$111.00') && !pending.element.textContent.includes('Total Views') && pending.calls.forbiddenMutations === 0, oldRevenueVisible: pending.element.textContent.includes('$111.00'), oldSellerViewVisible: pending.element.textContent.includes('Total Views'), calls: pending.calls });
  await act(() => current.resolve(capability('active'))); await pending.dispose();
  const check = (name, passed) => results.push({ name, passed: !!passed });
  for (const transition of ['coalesce', 'relogin', 'logout', 'unmount', 'strict']) {
    const old = defer(); const f = await mount({ oldStats: old, oldStatsOnce: true, strict: transition === 'strict' });
    if (transition === 'coalesce') await f.coalesce();
    if (transition === 'relogin') await f.change('A', true);
    if (transition === 'logout') { await f.change('A', true, true); await f.change('A', true); }
    if (transition === 'unmount') await f.dispose();
    await act(() => old.resolve(stats(transition === 'strict' ? 'A' : 'B')));
    check('lifecycle ' + transition, transition === 'unmount' ? !f.element.isConnected : f.element.textContent.includes('Synthetic A') && !f.element.textContent.includes('$222.00'));
    if (transition !== 'unmount') await f.dispose();
  }
  {
    const old = defer(); const f = await mount({ oldStats: old }); const reads = f.calls.stats.length;
    await f.refresh(); await act(() => old.resolve(stats('A')));
    check('same-owner refresh preserves pending read', f.calls.stats.length === reads && f.element.textContent.includes('$111.00')); await f.dispose();
  }
  for (const outcome of ['success', 'error']) {
    const first = defer(), second = defer();
    const f = await mount({ capsQueue: [ { promise: Promise.reject(Error('FAKE_INITIAL_FAILURE')) }, first, second ] });
    const retry = f.handler('Retry');
    await act(() => { void retry(); void retry(); });
    await act(() => outcome === 'success' ? first.resolve(capability('active')) : first.reject(Error('FAKE_OLD_RETRY_ERROR')));
    check('older retry ' + outcome + ' cannot finish newer loading or admit seller reads', !f.element.textContent.includes('Total Views') && !f.element.textContent.includes('Failed to load dashboard data') && f.calls.stats.length === 0);
    await act(() => second.resolve(capability('active')));
    check('newer retry settles normally ' + outcome, f.element.textContent.includes('$111.00'));
    await f.dispose();
  }
  {
    const f = await mount({ status: 'provisioning', security: true });
    const enable = f.handler('Enable');
    await act(() => enable()); const callback = f.modal().onSuccess;
    await f.coalesce(); const before = JSON.stringify(f.calls);
    await act(() => { enable(); void callback('FAKE_RETIRED_TOKEN'); });
    check('coalesced A B A rejects queued handlers', before === JSON.stringify(f.calls) && !f.modal().isOpen);
    await f.dispose();
  }
  for (const kind of ['connect', 'start']) {
    const f = await mount({ status: kind === 'start' ? 'not_requested' : 'provisioning' });
    const handler = f.handler(kind === 'start' ? 'Start selling' : 'Connect Stripe');
    await act(() => handler());
    check('current ' + kind + ' positive control', kind === 'start' ? f.calls.start === 1 && f.calls.notify === 1 : f.calls.redirect === 1);
    await f.dispose(); const before = JSON.stringify(f.calls);
    await act(() => handler()); check('unmounted ' + kind + ' handler rejects admission', before === JSON.stringify(f.calls));
  }
  {
    const pending = defer(); const newer = defer();
    const f = await mount({ ordersQueue: [{ promise: Promise.reject(Error('FAKE_ORDER_FAILURE')) }, pending, newer] });
    const retry = f.handler('Retry purchases');
    await act(() => { void retry(); void retry(); });
    await act(() => pending.reject(Error('FAKE_OLD_ORDER_FAILURE')));
    check('purchase old finally preserves newer loading', f.element.textContent.includes('Retrying purchases...'));
    await act(() => newer.resolve([{ id: 'FAKE_ORDER', listing_title: 'FAKE_CURRENT_ORDER', created_at: '', status: 'fulfilled', amount: 1 }]));
    check('purchase current retry succeeds', f.element.textContent.includes('FAKE_CURRENT_ORDER'));
    await f.dispose();
  }
  for (const detail of ['Re-authentication required', 'CSRF_REQUIRED', 'two_factor_managed_by_sso']) {
    const pending = defer(); const verify = detail === 'Re-authentication required';
    const f = await mount({ status: 'provisioning', security: true, sso: true, [verify ? 'verify' : 'setup']: pending });
    await act(() => f.handler('Enable')());
    await act(() => { void f.modal().onSuccess('FAKE_REAUTH_MARKER'); });
    if (verify) await act(() => { void f.handler('Verify and enable')(); });
    await f.switchB(); const before = JSON.stringify(f.calls);
    await act(() => pending.reject(new FakeAxiosError(detail === 'two_factor_managed_by_sso' ? 409 : 400, detail)));
    check('retired policy continuation ' + detail, before === JSON.stringify(f.calls) && !f.modal().isOpen && !f.element.textContent.includes('FAKE_REFUSAL'));
    await f.dispose();
  }
  for (const kind of ['setup', 'verify', 'connect', 'start', 'refresh']) {
    for (const outcome of ['success', 'error']) {
      const pending = defer();
      const plan = { status: kind === 'start' ? 'not_requested' : 'provisioning', security: !['connect', 'start'].includes(kind), [kind]: pending };
      const f = await mount(plan);
      let retained;
      if (['setup', 'verify', 'refresh'].includes(kind)) {
        await act(() => f.handler('Enable')());
        retained = f.modal().onSuccess;
        if (kind === 'setup') { await act(() => { void retained('FAKE_REAUTH_MARKER'); }); }
        else {
          await act(() => f.modal().onSuccess('FAKE_REAUTH_MARKER'));
          if (kind === 'verify') await act(() => { void f.handler('Verify and enable')(); });
          else { await act(() => f.handler('Verify and enable')()); await act(() => { void f.handler('Done')(); }); }
        }
      } else await act(() => { void f.handler(kind === 'start' ? 'Start selling' : 'Connect Stripe')(); });
      await f.switchB();
      const before = JSON.stringify(f.calls);
      await act(() => outcome === 'success' ? pending.resolve(kind === 'setup' ? { secret: 'RETIRED_SECRET', qr_uri: 'RETIRED_QR' } : kind === 'verify' ? { backup_codes: ['RETIRED_BACKUP'] } : kind === 'start' ? capability('active') : { data: 'RETIRED_REDIRECT' }) : pending.reject(Error('FAKE_RETIRED_ERROR')));
      if (retained) await act(() => retained('FAKE_RETIRED_TOKEN'));
      check('retired ' + kind + ' ' + outcome + ' and retained callback', before === JSON.stringify(f.calls) && !f.element.textContent.includes('RETIRED_'));
      await f.dispose();
    }
  }
  {
    const f = await mount({ status: 'provisioning', security: true });
    await act(() => f.handler('Enable')()); await act(() => f.modal().onSuccess('FAKE_REAUTH_MARKER'));
    check('current setup shows fake secret', f.element.textContent.includes('FAKE_SECRET_MARKER'));
    await act(() => f.handler('Verify and enable')());
    check('current verification shows fake backup codes', f.element.textContent.includes('FAKE_BACKUP_MARKER'));
    await act(() => f.handler('Done')()); check('current Done refreshes', f.calls.refresh === 1); await f.dispose();
  }
  if (results.some(x => !x.passed)) process.exitCode = 1;
  console.log(JSON.stringify({ node: process.version, react: React.version, typescript: ts.version, cases: results.length, passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length, results, limits: 'Selected actual DashboardOverview and DashboardLayout TSX in strict VM with explicit fake auth/capability/Stripe/stats/listing/order/navigation/policy/format/modal/QR/progress ports. Action ports are inert synthetic functions; no actual mutations execute. No actual API/auth/backend/app/QR/crypto imports, whole test module/Vitest, credentials/key generation/native/SQL/DB/network/customer/provider/payment/payout/onboarding/2FA operation. Current read lifecycle only, not real customer incidence or backend authorization bypass.' }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
