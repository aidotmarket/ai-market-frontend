import { expect, it, vi } from 'vitest';

const permanentRedirect = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ permanentRedirect }));

import ConnectorOAuthDocsPage from './page';

it('permanently redirects the OAuth documentation URL', () => {
  ConnectorOAuthDocsPage();
  expect(permanentRedirect).toHaveBeenCalledWith('/docs/connector');
});
