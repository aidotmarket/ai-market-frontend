// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ isAuthenticated: false }));
vi.mock('@/store/auth', () => ({ useAuthStore: () => auth }));

import AimDataPage, { metadata } from './page';

afterEach(() => {
  cleanup();
  auth.isAuthenticated = false;
});

describe('AimDataPage', () => {
  it('puts the free-account requirement before the gateway registration link', () => {
    render(<AimDataPage />);
    const setup = screen.getByRole('heading', { name: 'Set up your gateway' }).closest('section')!;
    expect(setup.id).toBe('gateway-setup');
    const signup = within(setup).getByRole('link', { name: 'Create a free account' });
    expect(signup.getAttribute('href')).toBe('/register?redirect=%2Fdashboard%2Fgateways');
    expect(signup.previousElementSibling?.textContent).toContain('Start with a free ai.market account.');
  });

  it('shows signed-out visitors what to prepare and where to pair after signing in', () => {
    render(<AimDataPage />);
    const setup = screen.getByRole('heading', { name: 'Set up your gateway' }).closest('section')!;
    expect(setup.id).toBe('gateway-setup');
    const guide = within(setup);
    expect(guide.getByRole('heading', { name: 'Before you create an account' })).toBeTruthy();
    expect(guide.getByText(/Linux host with Docker and Docker Compose/)).toBeTruthy();
    expect(guide.getByText(/read-only.*persistent writable state volume/)).toBeTruthy();
    const networkLink = guide.getByRole('link', { name: 'network requirements' });
    const networkSection = screen.getByRole('heading', { name: 'Network requirements' }).closest('section');
    expect(networkLink.getAttribute('href')).toBe(`#${networkSection?.id}`);

    const steps = within(guide.getByRole('list')).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0].textContent).toMatch(/Create a free ai\.market account or sign in/);
    expect(steps[1].textContent).toMatch(
      /If you’re new to selling, choose Start selling in Overview.*seller dashboard.*Gateways.*If prompted, finish the seller setup steps shown there.*Add a gateway/,
    );
    expect(steps[2].textContent).toMatch(/one-time pairing code.*generated Docker Compose snippet/);
  });

  it('takes signed-in visitors directly to Gateways in the seller dashboard', () => {
    auth.isAuthenticated = true;
    render(<AimDataPage />);
    const link = screen.getByRole('link', { name: 'Set up a gateway' });
    expect(link.getAttribute('href')).toBe('/dashboard/gateways');
    expect(screen.queryByRole('link', { name: 'Create a free account' })).toBeNull();
  });

  it('explains the gateway boundary and restores product structured data', () => {
    const { container } = render(<AimDataPage />);
    const text = container.textContent ?? '';

    expect(screen.getByRole('heading', { name: 'AIM Data gateway' })).toBeTruthy();
    expect(text).toMatch(/automatically sends generated file references, fingerprints made with a secret key, file sizes, formats, and timestamps/);
    expect(text).toMatch(/uses a neutral name unless you choose a display name/);
    expect(text).toContain('After you confirm a file, the gateway sends a checksum of the file.');
    expect(text).toContain('For file formats it can summarize, it also sends the row count and the names and types of the columns you include.');
    expect(text).toContain('For each included column, it reports roughly how much is missing and a range for the number of different values.');
    expect(text).toContain('No data values go to ai.market in these messages.');
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
    expect(heading.closest('section')?.id).toBe('network-requirements');
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
