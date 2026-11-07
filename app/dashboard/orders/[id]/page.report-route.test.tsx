// @vitest-environment jsdom
import '@/tests/support-network-trap';
import '@/tests/fixtures/request-thread-network-guard';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const canonical = '01234567-89ab-cdef-0123-456789abcdef';
const route = vi.hoisted(() => ({ segment: '', path: '', recovery: '' }));
const ports = vi.hoisted(() => ({ open: vi.fn(), recover: vi.fn(), order: vi.fn(), events: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => route.path, useParams: () => ({ id: route.segment }),
  useSearchParams: () => new URLSearchParams({ issue_report: route.recovery }) }));
vi.mock('@/api/support', async original => ({ ...await original<typeof import('@/api/support')>(), support: ports }));
vi.mock('@/api/orders', () => ({ getOrder: ports.order, getOrderEvents: ports.events, getOrderAccess: vi.fn() }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/orders/GatewayDeliverySection', () => ({ default: () => null }));
vi.mock('@/components/legal/TermsGate', () => ({ useTermsGate: () => ({ TermsGatePrompt: () => null }) }));
import OrderDetailPage from './page';
import { AllAIProvider, useAllAI } from '@/components/allai/AllAIContext';
import { principal, proposal } from '@/tests/support-fixtures';
let context: ReturnType<typeof useAllAI>;
function Page() { context = useAllAI(); return <OrderDetailPage />; }
const tree = () => <AllAIProvider><Page /></AllAIProvider>;
beforeEach(() => {
  vi.clearAllMocks(); principal(); sessionStorage.clear(); localStorage.clear(); route.recovery = '';
  ports.open.mockResolvedValue(proposal()); ports.recover.mockResolvedValue(proposal()); ports.events.mockResolvedValue([]);
  ports.order.mockResolvedValue({ id: canonical, buyer_id: 'buyer-fixture', seller_id: 'other', listing_title: 'Order dataset',
    amount: 25, status: 'pending_fulfillment', created_at: '2026-11-07', updated_at: '2026-11-07', access_expired: false });
});
afterEach(cleanup);
it.each([canonical, canonical.toUpperCase(), canonical.replaceAll('-', ''), canonical + '/'])('actual page button and issue_report recovery use real provider on %s', async spelling => {
  route.segment = spelling.replace(/\/$/, ''); route.path = '/dashboard/orders/' + spelling;
  const view = render(tree());
  fireEvent.click(await screen.findByRole('button', { name: 'Report Issue' }));
  await waitFor(() => expect(ports.open).toHaveBeenCalledTimes(1));
  expect(ports.open.mock.calls[0][0]).toBe(canonical); const visit = context.reportSession!;
  expect(visit.current()).toBe(true);
  route.segment = canonical.toUpperCase(); route.path = '/dashboard/orders/' + route.segment + '/'; view.rerender(tree());
  expect(context.reportSession).toBe(visit); expect(visit.current()).toBe(true);
  await act(async () => context.leaveReportIssue());
  route.recovery = 'proposal-one'; view.rerender(tree());
  await waitFor(() => expect(ports.recover).toHaveBeenCalledWith(canonical, 'proposal-one'));
  expect(context.reportSession?.current()).toBe(true); expect(ports.open).toHaveBeenCalledTimes(1);
  expect(ports.order.mock.calls.every(args => args[0] === canonical)).toBe(true);
});
