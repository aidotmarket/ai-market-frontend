// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import PartnerPage from './page';

afterEach(cleanup);

it('shows current gateway deployment requirements', () => {
  const { container } = render(<PartnerPage />);
  const text = container.textContent ?? '';

  expect(text).toContain('Docker and Docker Compose on Linux');
  expect(text).toContain('Deny-all egress except api.ai.market:443');
  expect(text).toContain('seller reverse proxy serving the gateway door over HTTPS');
  expect(text).toContain('canary reports open access');
  expect(text).not.toMatch(/Python 3\.11|P2P connectivity|4 GB RAM/i);
});
