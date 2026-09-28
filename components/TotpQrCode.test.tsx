// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import TotpQrCode from './TotpQrCode';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,cG5n') },
}));

describe('TotpQrCode', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the secret URI as a local PNG data URL without a network request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const uri = 'otpauth://totp/Test?secret=TESTSECRET';

    render(<TotpQrCode uri={uri} className="h-36 w-36" />);

    const image = await screen.findByRole('img', { name: 'QR code for two-factor authentication setup' });
    expect(image.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(image.getAttribute('class')).toBe('h-36 w-36');
    expect(QRCode.toDataURL).toHaveBeenCalledWith(uri, { width: 200, errorCorrectionLevel: 'M' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
