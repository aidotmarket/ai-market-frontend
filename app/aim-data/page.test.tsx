// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/store/auth', () => ({ useAuthStore: () => ({ isAuthenticated: false }) }));

import AimDataPage, { metadata } from './page';

afterEach(cleanup);

describe('AimDataPage', () => {
  it('explains the gateway boundary and restores product structured data', () => {
    const { container } = render(<AimDataPage />);
    const text = container.textContent ?? '';

    expect(screen.getByRole('heading', { name: 'AIM Data gateway' })).toBeTruthy();
    expect(text).toMatch(/automatically sends generated file references, fingerprints made with a secret key, file sizes, formats, and timestamps/);
    expect(text).toMatch(/uses a neutral name unless you choose a display name/);
    expect(text).toContain('After you confirm a file, it sends column names and types, the row count, and a checksum of the file.');
    expect(text).toContain('For each column, it reports roughly how much is missing and a range for the number of different values.');
    expect(text).toContain('No data values go to ai.market in these messages.');
    expect(text).toContain('public sample');
    expect(text).toContain('signed audit entries');
    expect(text).toContain('refuses to start as root or the wrong user');
    expect(text).toContain('canary reports open access');
    expect(text).not.toContain('refuses to start if those limits are loosened');

    const [application, breadcrumbs] = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!);
    expect(application).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'AIM Data gateway',
      description: metadata.description,
      operatingSystem: 'Linux (Docker)',
      codeRepository: 'https://github.com/aidotmarket/aim-data-gateway',
    });
    expect(breadcrumbs['@type']).toBe('BreadcrumbList');
    expect(breadcrumbs.itemListElement.at(-1).item).toBe('https://ai.market/aim-data');
  });
});
