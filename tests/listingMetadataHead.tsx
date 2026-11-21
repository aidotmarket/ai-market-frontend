import { createRequire } from 'node:module';
import type { Metadata } from 'next';
import { BasicMeta } from 'next/dist/lib/metadata/generate/basic';
import { OpenGraphMetadata, TwitterMetadata } from 'next/dist/lib/metadata/generate/opengraph';
import { renderToStaticMarkup } from 'react-dom/server';

export async function renderListingMetadataHead(root: Metadata, page: Metadata, slug: string) {
  const require = createRequire(import.meta.url);
  const serverOnly = require.resolve('server-only');
  const previous = require.cache[serverOnly];
  // Load Next's server metadata resolver outside the app router's server module alias.
  require.cache[serverOnly] = { exports: {} } as NodeModule;
  let accumulateMetadata: typeof import('next/dist/lib/metadata/resolve-metadata').accumulateMetadata;
  try {
    ({ accumulateMetadata } = require('next/dist/lib/metadata/resolve-metadata'));
  } finally {
    if (previous) require.cache[serverOnly] = previous;
    else delete require.cache[serverOnly];
  }

  const path = `/listings/${slug}`;
  const metadata = await accumulateMetadata(path, [[root, null], [page, null]], Promise.resolve(path), {
    trailingSlash: false,
    isStaticMetadataRouteFile: false,
  });
  const head = document.createElement('head');
  head.innerHTML = renderToStaticMarkup(<>
    <BasicMeta metadata={metadata} />
    <OpenGraphMetadata openGraph={metadata.openGraph} />
    <TwitterMetadata twitter={metadata.twitter} />
  </>);

  return ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']
    .map(selector => head.querySelector(selector)?.getAttribute('content') ?? null);
}
