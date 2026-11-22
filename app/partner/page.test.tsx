// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import PartnerPage from './page';

afterEach(cleanup);

it('shows current gateway deployment requirements', () => {
  const { container } = render(<PartnerPage />);
  const text = container.textContent ?? '';

  expect(text).toContain('automatically sends generated file references and fingerprints made with a secret key.');
  expect(text).toContain('It includes a display name if you set one.');
  expect(text).toContain('After you confirm a file, the gateway sends a checksum of the file.');
  expect(text).toContain('For file formats it can summarize, it also sends the row count and the names and types of the columns you include.');
  expect(text).toContain('For each included column, it reports roughly how much is missing and a range for the number of different values.');
  expect(text).toContain('No data values go to ai.market in these messages.');
  expect(text).toContain('Docker and Docker Compose on Linux');
  expect(text).toContain('Deny-all egress except api.ai.market:443');
  expect(text).toContain('seller reverse proxy serving the gateway door over HTTPS');
  expect(text).toContain('canary reports open access');
  expect(text).not.toMatch(/Python 3\.11|P2P connectivity|4 GB RAM/i);
});
