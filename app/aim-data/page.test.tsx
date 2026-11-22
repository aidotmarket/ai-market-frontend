// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
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
    expect(text).toContain('The gateway container refuses to start as root or the wrong user');
    expect(text).toContain('host network or process namespace');
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

  it('distinguishes public HTTPS delivery from private gateway HTTP and restricted egress', () => {
    render(<AimDataPage />);
    const heading = screen.getByRole('heading', { name: 'Network requirements' });
    const network = within(heading.closest('section')!);
    const inbound = network.getByText(/seller-controlled HTTPS delivery endpoint/).textContent;
    expect(inbound).toMatch(/signed reachability probe/);
    expect(inbound).toMatch(/publicly reachable hostname and a valid TLS certificate/);
    expect(inbound).toMatch(/inbound TCP 443 through your firewall to your reverse proxy/);
    expect(inbound).toMatch(/terminates TLS.*private HTTP on\s+port 8080/s);
    expect(inbound).toMatch(/no other public inbound ports/);
    const outbound = network.getByText(/Restrict outbound gateway access/).textContent;
    expect(outbound).toMatch(/api\.ai\.market:443/);
    expect(outbound).toMatch(/connections that must fail/);
    expect(outbound).toMatch(/blocks\s+publishing and new permissions/);
  });
});
