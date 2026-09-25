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
  expect(text).toContain('signed audit entries');
  expect(text).not.toMatch(/Verifiable Credentials|X25519|opaque to the platform|endpoints can decrypt|trust score/i);
});
