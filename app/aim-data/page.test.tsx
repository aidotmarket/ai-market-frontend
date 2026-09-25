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
    expect(text).toContain('opaque file IDs, keyed content commitments');
    expect(text).toContain('raw SHA-256');
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
