import type { makeRouteHandler } from '@keystatic/next/route-handler';

type Handlers = ReturnType<typeof makeRouteHandler>;
type InitializedHandlers = { handlers: Handlers; publicOrigin?: string };
let initialization: Promise<InitializedHandlers> | undefined;

function getHandlers(): Promise<InitializedHandlers> {
  // Defer private-setting validation until a request, after startup hydration.
  // Share in-flight and successful initialization, but allow failures to retry.
  initialization ??= Promise.all([
    import('@keystatic/next/route-handler'),
    import('../../../../keystatic.config'),
  ])
    .then(async ([{ makeRouteHandler }, { default: config }]) => {
      const handlers = await makeRouteHandler({ config });
      if (process.env.NODE_ENV !== 'production' || config.storage.kind !== 'github') {
        return { handlers };
      }

      // Read the site URL from the server environment after startup hydration.
      const { NEXT_PUBLIC_SITE_URL } = process.env;
      const publicOrigin = new URL(NEXT_PUBLIC_SITE_URL || 'https://ai.market').origin;
      return { handlers, publicOrigin };
    })
    .catch((error: unknown) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}

function withPublicOrigin(request: Request, publicOrigin?: string): Request {
  if (!publicOrigin) return request;

  // Keystatic builds its OAuth callback from the URL, which can carry Railway's internal host.
  const url = new URL(request.url);
  if (url.origin === publicOrigin) return request;

  // Request supplies the original headers, method, and stream (including duplex).
  return new Request(`${publicOrigin}${url.pathname}${url.search}${url.hash}`, request);
}

export async function GET(request: Parameters<Handlers['GET']>[0]) {
  const { handlers, publicOrigin } = await getHandlers();
  return handlers.GET(withPublicOrigin(request, publicOrigin));
}

export async function POST(request: Parameters<Handlers['POST']>[0]) {
  const { handlers, publicOrigin } = await getHandlers();
  return handlers.POST(withPublicOrigin(request, publicOrigin));
}
