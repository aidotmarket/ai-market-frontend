import { makeRouteHandler } from '@keystatic/next/route-handler';
import keystaticConfig from '../../../../keystatic.config';
import { NextRequest } from 'next/server';

const baseHandler = makeRouteHandler({
  config: keystaticConfig,
});

// Railway proxy sends requests with internal hostname (127.0.0.1:8080).
// Rewrite to the public URL so OAuth redirect_uri is correct.
const PUBLIC_URL = process.env.KEYSTATIC_URL || 'https://ai.market';

function rewriteRequest(req: NextRequest): NextRequest {
  const original = new URL(req.url);
  const pub = new URL(PUBLIC_URL);
  const rewritten = new URL(original.pathname + original.search, pub);
  return new NextRequest(rewritten, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
}

export async function GET(req: NextRequest) {
  return baseHandler.GET!(rewriteRequest(req));
}

export async function POST(req: NextRequest) {
  return baseHandler.POST!(rewriteRequest(req));
}
