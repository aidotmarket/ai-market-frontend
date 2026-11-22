// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ProtocolPage from './page';

afterEach(cleanup);

it('describes signed permission and direct delivery without legacy cryptography claims', () => {
  const { container } = render(<ProtocolPage />);
  const text = container.textContent ?? '';

  expect(text).toContain('ai.market signs file-specific download permissions');
  expect(text).toContain('seller gateway checks each signature');
  expect(text).toContain('HTTPS door');
  expect(text).toContain('automatically sends generated file references and fingerprints made with a secret key.');
  expect(text).toContain('It includes a display name if the seller sets one.');
  expect(text).toContain('After the seller confirms a file, the gateway sends details about its columns and rows, along with a checksum of the file itself. No data values go to ai.market in these messages.');
  expect(text).toContain('signed audit entries');
  expect(text).toContain('nothing to download');
  expect(text).toContain('Links already issued can remain usable for up to five minutes');
  expect(text).not.toMatch(/Verifiable Credentials|X25519|opaque to the platform|endpoints can decrypt|trust score/i);
});
