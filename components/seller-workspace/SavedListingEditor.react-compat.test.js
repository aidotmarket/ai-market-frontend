import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInContext } from "node:vm";
import { waitFor, within } from "@testing-library/react";
import { build } from "esbuild";
import { JSDOM, requestInterceptor } from "jsdom";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createVendoredReactAliases } = require("next/dist/build/create-compiler-aliases");
const { WEBPACK_LAYERS } = require("next/dist/lib/constants");
const origin = "http://workspace.test";

it("opens Describe and price from a saved licence with Next's production App Router React", async () => {
  const nextAliases = createVendoredReactAliases("", {
    layer: WEBPACK_LAYERS.appPagesBrowser,
    isBrowser: true,
    isEdgeServer: false,
    reactProductionProfiling: false,
  });
  const entries = ["react", "react/jsx-runtime", "react-dom", "react-dom/client"];
  const { outputFiles, metafile } = await build({
    entryPoints: [fileURLToPath(new URL("../../tests/savedListingRuntimeFixture.tsx", import.meta.url))],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "savedListingFixture",
    jsx: "automatic",
    alias: Object.fromEntries(entries.map(entry => [entry, require.resolve(nextAliases[entry + "$"])])),
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.NEXT_PUBLIC_API_URL": JSON.stringify(origin),
      "process.env.NEXT_PUBLIC_LISTING_REVIEW_ENABLED": JSON.stringify("false"),
    },
    metafile: true,
    write: false,
  });
  const inputs = Object.keys(metafile.inputs);
  expect(inputs.some(path => path.endsWith("/next/dist/compiled/react/cjs/react.production.js"))).toBe(true);
  expect(inputs.some(path => path.endsWith("/next/dist/compiled/react-dom/cjs/react-dom-client.production.js"))).toBe(true);
  expect(inputs.filter(path => /(?:^|\/)node_modules\/(?:react|react-dom)\//.test(path))).toEqual([]);

  const requests = [];
  const responses = new Map();
  function respond(request) {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}${url.search}`;
    const allowed = url.origin === origin && responses.has(route);
    requests.push({ route, allowed });
    return allowed ? Response.json(responses.get(route)) : new Response(null, { status: 403 });
  }
  const dom = new JSDOM('<div id="root"></div>', {
    url: origin,
    runScripts: "outside-only",
    resources: { interceptors: [requestInterceptor(respond)] },
  });
  const { window } = dom;
  const { document } = window;
  // Keep fetch traffic in the same fixtures as XHR, with no outbound network.
  window.fetch = async (input, options) => respond(new Request(new URL(input, origin), options));

  let root;
  try {
    runInContext(outputFiles[0].text, dom.getInternalVMContext(), { filename: "saved-listing.browser.js" });
    const { draft, legalIdentity, mount } = window.savedListingFixture;
    const draftRead = "GET /api/v1/seller-workspace/listing-draft";
    const identityRefresh = "POST /api/v1/seller-workspace/legal-identity/refresh";
    responses.set(draftRead, { draft });
    responses.set("GET /api/v1/auth/capabilities", {});
    responses.set("GET /api/v1/seller-workspace/legal-identity", legalIdentity);
    responses.set(identityRefresh, legalIdentity);
    const { promise: listingEffectsRan, resolve: onListingEffects } = Promise.withResolvers();
    const { errors, renderer } = mount(document.getElementById("root"), onListingEffects);
    root = renderer;

    const ui = within(document.body);
    const options = { container: document.body };
    const next = await ui.findByRole("button", { name: "Next: Describe and price →" }, options);
    await waitFor(() => expect(next.disabled).toBe(false), options);
    expect(ui.getByText("Licence choice saved to your account.")).toBeTruthy();
    expect(ui.queryByLabelText("Title")).toBeNull();
    const beforeNavigation = requests.length;
    next.click();

    await listingEffectsRan;
    await waitFor(() => {
      if (!errors.length) expect(ui.getByLabelText("Title").value).toBe(draft.content.title);
    }, options);
    if (errors.length) throw errors[0];
    expect(ui.getByRole("heading", { name: "Describe and price" })).toBeTruthy();
    expect(ui.getByLabelText("Your price (USD)").value).toBe(draft.content.price);
    expect(ui.queryByRole("heading", { name: "Choose a licence" })).toBeNull();
    expect(ui.queryByRole("button", { name: "Reload page" })).toBeNull();
    expect(requests.filter(request => !request.allowed)).toEqual([]);
    expect(requests.filter(request => request.route === draftRead)).toHaveLength(1);
    // The existing licence step refreshes identity before enabling Next.
    expect(requests.filter(request => !request.route.startsWith("GET ")).map(request => request.route))
      .toEqual([identityRefresh]);
    expect(requests.slice(beforeNavigation).filter(request => !request.route.startsWith("GET "))).toEqual([]);
  } finally {
    root?.unmount();
    window.close();
  }
});
