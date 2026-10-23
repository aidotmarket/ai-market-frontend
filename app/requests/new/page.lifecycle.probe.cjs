// Standalone actual-component regression probe: run with Node 24, no Vitest or network.
// Only the page is transpiled/evaluated; all transport/auth/UI services are doubles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const React = require('react');
const { JSDOM } = require('jsdom');
const ts = require('typescript');
const { AxiosError } = require('axios');
const { create } = require('zustand');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.invalid/requests/new',
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = require('react-dom/client');
const source = fs.readFileSync(`${__dirname}/page.tsx`, 'utf8');
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText;

const initialAuth = () => ({
  user: { id: 'account-A' }, token: 'synthetic-A',
  isAuthenticated: true, isLoading: false, hydrated: true,
});
const fields = {
  description: '  Synthetic private request for licensed retail data.  ',
  categories: ' retail, marketing, , ', format: ' CSV, JSON, , ',
  priceMin: '12.50', priceMax: '400.75', urgency: 'urgent',
  provenance: '  Synthetic licensing requirements  ',
};
const blank = { description: '', categories: '', format: '', priceMin: '', priceMax: '',
  urgency: 'normal', provenance: '' };
const payload = {
  description: fields.description.trim(), categories: ['retail', 'marketing'],
  format_preferences: ['CSV', 'JSON'], price_range_min: 12.5, price_range_max: 400.75,
  currency: 'USD', urgency: 'urgent', provenance_requirements: fields.provenance.trim(),
};
const success = ['Data request created as a draft. Open it from the detail page.', 'success'];

async function mounted(strict = false, state = initialAuth()) {
  // Actual Zustand bound hook, including getState/subscribe/setState signatures.
  const useAuthStore = create(() => state);
  const calls = [], pushes = [], toasts = [], pending = [];
  const dependencies = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { useRouter: () => ({ push: (path) => pushes.push(path) }) },
    '@/store/auth': { useAuthStore },
    '@/components/Toast': { useToast: () => ({ toast: (...args) => toasts.push(args) }) },
    '@/api/data-requests': { createDataRequest: (data) => {
      // Normalize VM realm prototypes while preserving undefined payload fields.
      calls.push(structuredClone(data));
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    } },
    axios: { AxiosError },
  };
  const vmModule = { exports: {} };
  vm.runInNewContext(js, { module: vmModule, exports: vmModule.exports, require: (name) => {
    assert.ok(name in dependencies, `Unexpected import: ${name}`);
    return dependencies[name];
  } }, { filename: 'actual-new-request-page.js' });
  const el = document.createElement('div');
  document.body.appendChild(el);
  let root;
  let passiveCleanup = false;
  function DepartureWitness() {
    React.useEffect(() => {
      passiveCleanup = false;
      return () => { passiveCleanup = true; };
    }, []);
    return React.createElement(vmModule.exports.default);
  }
  const renderPage = async () => React.act(async () => {
    const page = React.createElement(DepartureWitness);
    root.render(strict ? React.createElement(React.StrictMode, null, page) : page);
  });
  async function mount() {
    root = createRoot(el);
    await renderPage();
  }
  await mount();
  const button = () => el.querySelector('button');
  const values = () => Object.fromEntries(Object.keys(blank).map((id) => [id, el.querySelector(`#${id}`)?.value]));
  const fill = async (data = fields) => React.act(async () => {
    for (const [id, value] of Object.entries(data)) {
      const input = el.querySelector(`#${id}`);
      const prototype = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
        : input.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value);
      input.dispatchEvent(new window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    }
  });
  const submit = async () => React.act(async () => {
    el.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  });
  const update = async (...updates) => React.act(async () => {
    for (const update of updates) useAuthStore.setState(update);
  });
  const settle = async (index, error = null) => React.act(async () => {
    if (error) pending[index].reject(error);
    else pending[index].resolve({ slug: `synthetic-${index}` });
  });
  const unmount = async () => React.act(async () => root.unmount());
  const departAndSettle = async (error) => {
    // Deliberately schedule outside act: act would flush passive cleanup first.
    const previousActEnvironment = global.IS_REACT_ACT_ENVIRONMENT;
    global.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      await new Promise((resolve, reject) => {
        const observer = new window.MutationObserver(() => {
          if (el.querySelector('form')) return;
          observer.disconnect();
          try {
            assert.equal(passiveCleanup, false, 'completion must precede passive cleanup');
            if (error) pending[0].reject(error);
            else pending[0].resolve({ slug: 'obsolete-departure' });
            resolve();
          } catch (failure) { reject(failure); }
        });
        observer.observe(el, { childList: true, subtree: true });
        React.startTransition(() => root.render(null));
      });
      // Let the create continuation run before act flushes the remaining effects.
      await Promise.resolve();
    } finally { global.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; }
    await React.act(async () => {});
    assert.equal(passiveCleanup, true);
  };
  const close = async () => { await unmount(); el.remove(); };
  return { el, calls, pushes, toasts, button, values, fill, submit, update, settle, unmount, mount,
    departAndSettle, renderPage, close };
}

function validationError(detail) {
  return new AxiosError('Synthetic validation failure', 'ERR_BAD_REQUEST', undefined, undefined,
    { data: { detail }, status: 422, statusText: 'Unprocessable Entity', headers: {}, config: {} });
}

/** @type {Array<[string, () => Promise<void>]>} */
const cases = [];
const test = (name, run) => cases.push([name, run]);

for (const strict of [false, true]) test(`valid payload and ordinary success (StrictMode=${strict})`, async () => {
  const h = await mounted(strict);
  try {
    assert.match(h.el.textContent, /We create it as a draft/);
    await h.fill(); await h.submit();
    assert.deepEqual(h.calls, [payload]);
    assert.equal(h.button().textContent, 'Creating...');
    await h.submit(); assert.equal(h.calls.length, 1);
    await h.settle(0);
    assert.deepEqual(h.toasts, [success]);
    assert.deepEqual(h.pushes, ['/requests/synthetic-0']);
    assert.equal(h.button().disabled, false);
  } finally { await h.close(); }
});

test('blank optional fields preserve the existing payload contract', async () => {
  const h = await mounted();
  try {
    await h.fill({ description: fields.description }); await h.submit();
    assert.deepEqual(h.calls, [{ description: fields.description.trim(), categories: undefined,
      format_preferences: undefined, price_range_min: undefined, price_range_max: undefined,
      currency: 'USD', urgency: 'normal', provenance_requirements: undefined }]);
    await h.settle(0);
  } finally { await h.close(); }
});

for (const [detail, message] of [
  ['Correct this draft', 'Correct this draft'],
  [[{ loc: ['body', 'description'], msg: 'too short' }], 'description: too short'],
  [{ reason: 'Synthetic rejection' }, '{"reason":"Synthetic rejection"}'],
]) test(`ordinary rejection retains all fields: ${message}`, async () => {
  const h = await mounted();
  try {
    await h.fill(); await h.submit(); await h.settle(0, validationError(detail));
    assert.deepEqual(h.toasts, [[message, 'error']]);
    assert.deepEqual(h.values(), fields);
    assert.deepEqual(h.pushes, []); assert.equal(h.button().disabled, false);
    await h.fill({ description: 'Corrected synthetic description' });
    await h.submit(); assert.equal(h.calls.length, 2); await h.settle(1);
  } finally { await h.close(); }
});

for (const error of [null, validationError('Synthetic obsolete failure')]) {
  test(`unmount/remount suppresses late ${error ? 'error' : 'success'}`, async () => {
    const h = await mounted();
    try {
      await h.fill(); await h.submit(); await h.unmount(); await h.mount();
      assert.deepEqual(h.values(), blank);
      await h.fill(); await h.submit();
      await h.settle(0, error);
      assert.deepEqual(h.toasts, []); assert.deepEqual(h.pushes, []);
      assert.equal(h.button().textContent, 'Creating...');
      await h.settle(1); assert.deepEqual(h.toasts, [success]);
    } finally { await h.close(); }
  });
}

for (const logout of [false, true]) test(`clears every field and pending state on ${logout ? 'logout' : 'account change'}`, async () => {
  const h = await mounted();
  try {
    await h.fill(); await h.submit();
    await h.update(logout ? { user: null, token: null, isAuthenticated: false }
      : { user: { id: 'account-B' }, token: 'synthetic-B' });
    if (logout) {
      assert.equal(h.el.querySelector('form'), null);
      assert.ok(h.pushes.every((path) => path === '/login?redirect=%2Frequests%2Fnew'));
      await h.update(initialAuth());
    }
    assert.deepEqual(h.values(), blank);
    await h.fill({ description: 'New account draft' });
    assert.equal(h.button().disabled, false);
    h.pushes.length = 0;
    await h.settle(0, validationError('Old account failure'));
    assert.deepEqual(h.toasts, []); assert.deepEqual(h.pushes, []);
    assert.equal(h.values().description, 'New account draft');
    assert.equal(h.calls.length, 1);
  } finally { await h.close(); }
});

for (const batched of [false, true]) test(`A -> B -> A retires old owner and finally (batched=${batched})`, async () => {
  const h = await mounted();
  try {
    await h.fill(); await h.submit();
    const b = { user: { id: 'account-B' }, token: 'synthetic-B' };
    if (batched) await h.update(b, initialAuth());
    else { await h.update(b); await h.update(initialAuth()); }
    assert.deepEqual(h.values(), blank);
    await h.fill(); await h.submit();
    await h.settle(0);
    assert.deepEqual(h.toasts, []); assert.deepEqual(h.pushes, []);
    assert.equal(h.button().textContent, 'Creating...'); assert.equal(h.button().disabled, true);
    await h.submit(); assert.equal(h.calls.length, 2);
    await h.settle(1); assert.deepEqual(h.toasts, [success]);
  } finally { await h.close(); }
});

test('same ID token and user-object refresh preserves draft and pending operation', async () => {
  const h = await mounted();
  try {
    await h.fill();
    await h.update({ user: { id: 'account-A', first_name: 'Refreshed' }, token: 'synthetic-rotated' });
    assert.deepEqual(h.values(), fields);
    await h.submit();
    await h.update({ user: { id: 'account-A' }, token: 'synthetic-again', isLoading: true });
    assert.equal(h.el.querySelector('form'), null);
    await h.update({ isLoading: false });
    assert.deepEqual(h.values(), fields); assert.equal(h.button().textContent, 'Creating...');
    await h.settle(0); assert.deepEqual(h.toasts, [success]);
    assert.deepEqual(h.pushes, ['/requests/synthetic-0']); assert.equal(h.calls.length, 1);
  } finally { await h.close(); }
});

test('loading/hydration, identity resolution and anonymous redirect remain gated', async () => {
  const h = await mounted(false, { ...initialAuth(), hydrated: false, isLoading: true });
  try {
    assert.equal(h.el.querySelector('form'), null); assert.deepEqual(h.pushes, []);
    await h.update({ hydrated: true, isLoading: false, user: null });
    assert.equal(h.el.querySelector('form'), null); assert.deepEqual(h.pushes, []);
    await h.update({ isAuthenticated: false });
    assert.equal(h.el.querySelector('form'), null);
    assert.ok(h.pushes.includes('/login?redirect=%2Frequests%2Fnew'));
    assert.deepEqual(h.calls, []);
  } finally { await h.close(); }
});

for (const strict of [false, true]) for (const error of [null, validationError('Obsolete departure')]) {
  test(`async DOM departure suppresses ${error ? 'error' : 'success'} before passive cleanup (StrictMode=${strict})`, async () => {
    const h = await mounted(strict);
    try {
      await h.fill(); await h.submit();
      await h.departAndSettle(error);
      assert.equal(h.el.querySelector('form') === null, true);
      assert.deepEqual(h.toasts, []); assert.deepEqual(h.pushes, []);
      await h.renderPage();
      assert.deepEqual(h.values(), blank);
      await h.fill(); await h.submit();
      assert.equal(h.calls.length, 2);
      assert.equal(h.button().textContent, 'Creating...');
      assert.equal(h.button().disabled, true);
      await h.submit(); assert.equal(h.calls.length, 2);
      await h.settle(1);
      assert.deepEqual(h.toasts, [success]);
      assert.deepEqual(h.pushes, ['/requests/synthetic-1']);
      assert.equal(h.button().disabled, false);
    } finally { await h.close(); }
  });
}

module.exports = { cases, dispose: () => dom.window.close() };

if (require.main === module) (async () => {
  for (const [name, run] of cases) {
    await run();
    console.log(`PASS ${name}`);
  }
  console.log(`PASS ${cases.length} actual-mounted lifecycle regressions; mocked services only`);
  dom.window.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
