import type { makeRouteHandler } from '@keystatic/next/route-handler';

type Handlers = ReturnType<typeof makeRouteHandler>;
let initialization: Promise<Handlers> | undefined;

function getHandlers(): Promise<Handlers> {
  // Defer private-setting validation until a request, after startup hydration.
  // Share in-flight and successful initialization, but allow failures to retry.
  initialization ??= Promise.all([
    import('@keystatic/next/route-handler'),
    import('../../../../keystatic.config'),
  ])
    .then(([{ makeRouteHandler }, { default: config }]) =>
      makeRouteHandler({ config }),
    )
    .catch((error: unknown) => {
      initialization = undefined;
      throw error;
    });
  return initialization;
}

export async function GET(...args: Parameters<Handlers['GET']>) {
  return (await getHandlers()).GET(...args);
}

export async function POST(...args: Parameters<Handlers['POST']>) {
  return (await getHandlers()).POST(...args);
}
