import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrderIssueReport from './OrderIssueReport';
import { CustomerSupportMessage } from './AllAIMessage';
import { CustomerTicketStatus } from './TicketStatusCard';
import { OrderIssueSession } from '@/lib/order-issue-report';
import { reportProposal } from '@/api/support';
import { fakePort, principal, proposal, confirmed, conversation, deferred, rejection, context } from '@/tests/support-fixtures';
import type { CustomerConversation } from '@/api/support';

const sessions: OrderIssueSession[] = [];
async function mount(p = proposal()) {
  principal(); const port = fakePort(); vi.mocked(port.open).mockResolvedValue(p);
  const session = new OrderIssueSession('order-fixture', port); sessions.push(session);
  await session.open();
  const result = render(<OrderIssueReport session={session} onLeave={vi.fn()} />);
  return { session, port, ...result };
}
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { cleanup(); sessions.splice(0).forEach(s => s.retire()); });

describe('order reporting customer UI', () => {
  it.each(['buyer', 'seller'] as const)('permits %s review using the same commands and truthful pending-email state', async role => {
    principal(role); const port = fakePort(); const session = new OrderIssueSession('order-fixture', port); sessions.push(session);
    await session.open(); render(<OrderIssueReport session={session} onLeave={vi.fn()} />);
    const confirm = screen.getByRole('button', { name: 'Confirm and file report' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Customer reviewed final text' } });
    expect(screen.getByText('Unsaved draft; not reported')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved; not reported');
    fireEvent.click(screen.getByRole('checkbox', { name: /I have reviewed/ }));
    fireEvent.click(confirm);
    await screen.findByText('Report confirmed');
    expect(screen.getByText('Original confirmed report')).toBeTruthy();
    expect(screen.getByText(/Email confirmation needed; your report is saved/)).toBeTruthy();
    expect(screen.queryByText(/Email delivered/)).toBeNull();
    expect(screen.queryByLabelText(/code/i)).toBeNull();
    expect(screen.getByText('Customer reviewed final text')).toBeTruthy();
    expect(port.confirm).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0); expect(localStorage.length).toBe(0);
  });
  it('projects adversarial snapshot keys out; renders allowed title literally, never active HTML', async () => {
    const parsed = reportProposal({ ...proposal(), context: { ...context, stripe: 'EXCLUDED-STRIPE',
      internal_notes: 'EXCLUDED-INTERNAL', listing_snapshot: { title: 'EXCLUDED-NESTED' }, delivery_config: { token: 'EXCLUDED-TOKEN' } } });
    const { container } = await mount(parsed);
    expect(container.textContent).not.toMatch(/EXCLUDED/);
    expect(screen.getByText('<script>plain title</script>')).toBeTruthy();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
  });
  it.each(['unavailable', 'unknown'] as const)('enrollment %s never promises available filing', async enrollment => {
    await mount(proposal({ enrollment }));
    expect(screen.getByText(/New order reporting is unavailable/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /I have reviewed/ }));
    expect((screen.getByRole('button', { name: 'Confirm and file report' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it.each(['model_unavailable', 'capped'] as const)('guidance %s keeps plain editable same-command fallback', async guidance_state => {
    const { port } = await mount(proposal({ guidance_state, guidance_turns: guidance_state === 'capped' ? 20 : 0 }));
    expect(screen.getByText(/Guidance is unavailable/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use plain form / send report anyway' }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Fallback exact description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText('Draft saved; not reported');
    expect(port.save).toHaveBeenCalledWith('order-fixture', 'proposal-one', 1,
      { category: 'other', description: 'Fallback exact description' }, 'web');
    expect(port.guide).not.toHaveBeenCalled();
  });
  it('429 preserves unsaved form and reports no ticket success', async () => {
    const { port } = await mount();
    vi.mocked(port.save).mockRejectedValue(rejection(429));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Retained local original' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByText(/Please try again later/);
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Retained local original');
    expect(screen.queryByText('Report confirmed')).toBeNull();
  });
  it('expired filing preserves draft; copy needs separate explicit consent and fresh report review', async () => {
    const { port } = await mount(proposal({ expires_at: '2000-01-01T00:00:00Z' }));
    expect((screen.getByRole('button', { name: 'Create authorized copy' }) as HTMLButtonElement).disabled).toBe(true);
    expect(port.open).toHaveBeenCalledTimes(1);
    vi.mocked(port.open).mockResolvedValue(proposal({ proposal_id: 'fresh-proposal', conversation_id: 'fresh-conversation' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Copy this draft to a new proposal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create authorized copy' }));
    await screen.findByText('Unsaved draft; not reported');
    expect(port.open).toHaveBeenCalledTimes(2); expect(port.confirm).not.toHaveBeenCalled();
    expect((screen.getByRole('checkbox', { name: /I have reviewed/ }) as HTMLInputElement).checked).toBe(false);
  });
  it('unknown reply reconciles original conversation and explicit retry retains nonce; no automatic close/fix', async () => {
    const { port } = await mount(proposal({ confirmation: confirmed({ status: 'closed' }) }));
    await waitFor(() => expect(port.conversation).toHaveBeenCalledTimes(1));
    vi.mocked(port.reply).mockRejectedValueOnce(new Error('lost commit')).mockResolvedValueOnce(conversation({ status: 'in_progress', next_action: 'Athena is reviewing the failed fix.' }));
    fireEvent.change(screen.getByLabelText('Reply or report that the fix still fails'), { target: { value: 'The fix still fails' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await screen.findByText(/Reply result is unknown/);
    expect(port.reply).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Send reply' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh conversation' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Send reply' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await screen.findByText('Athena is reviewing the failed fix.');
    expect(vi.mocked(port.reply).mock.calls[1]).toEqual(vi.mocked(port.reply).mock.calls[0]);
  });
  it('late conversation response after principal change never renders old content', async () => {
    principal(); const port = fakePort(); const pending = deferred<CustomerConversation>();
    vi.mocked(port.open).mockResolvedValue(proposal({ confirmation: confirmed() }));
    vi.mocked(port.conversation).mockReturnValue(pending.promise);
    const session = new OrderIssueSession('order', port); sessions.push(session); await session.open();
    const { container } = render(<OrderIssueReport session={session} onLeave={vi.fn()} />);
    await act(async () => { principal('seller', 'new-account'); });
    await act(async () => { pending.resolve(conversation({ next_action: 'OLD PRIVATE RESPONSE' })); await pending.promise; });
    expect(container.textContent).toBe(''); expect(screen.queryByText('OLD PRIVATE RESPONSE')).toBeNull();
    expect(port.receipt).not.toHaveBeenCalled();
  });
});

describe('actual rendered version receipts', () => {
  let notify: (entries: IntersectionObserverEntry[]) => void;
  let target: Element;
  let disconnect: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: (entries: IntersectionObserverEntry[]) => void) { notify = callback; }
      observe(element: Element) { target = element; }
      disconnect = disconnect;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, width: 100, height: 30, top: 0, left: 0, right: 100, bottom: 30, toJSON: () => ({}) });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const visible = () => act(() => notify([{ target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry]));
  it('posts exact server message/version only after visibly rendered and only once per mounted version', async () => {
    const receipt = vi.fn(async () => {});
    render(<CustomerSupportMessage message={confirmed().acknowledgement} current={() => true} onRendered={receipt} />);
    expect(receipt).not.toHaveBeenCalled();
    await visible(); await visible(); expect(receipt).toHaveBeenCalledTimes(1);
    cleanup(); expect(disconnect).toHaveBeenCalled();
  });
  it.each(['hidden', 'offscreen', 'retired', 'zero-geometry', 'transparent'] as const)('%s view never creates a receipt', async mode => {
    const receipt = vi.fn(async () => {});
    if (mode === 'zero-geometry') vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({ width: 0, height: 0 } as DOMRect);
    render(<div hidden={mode === 'hidden'} style={mode === 'transparent' ? { opacity: 0 } : undefined}>
      <CustomerSupportMessage message={confirmed().acknowledgement} current={() => mode !== 'retired'} onRendered={receipt} />
    </div>);
    await act(() => notify([{ target, isIntersecting: mode !== 'offscreen', intersectionRatio: mode === 'offscreen' ? 0 : 1 } as IntersectionObserverEntry]));
    expect(receipt).not.toHaveBeenCalled();
  });
  it('visible original conversation posts the exact server message and immutable version through the scoped port', async () => {
    const { port } = await mount(proposal({ confirmation: confirmed() }));
    await waitFor(() => expect(port.conversation).toHaveBeenCalledTimes(1));
    expect(port.receipt).not.toHaveBeenCalled();
    await visible();
    expect(port.receipt).toHaveBeenCalledWith('SUP-42', 'server-ack-id', 'immutable-v1');
  });
  it('background document never creates a customer render receipt', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const receipt = vi.fn(async () => {});
    render(<CustomerSupportMessage message={confirmed().acknowledgement} current={() => true} onRendered={receipt} />);
    await visible(); expect(receipt).not.toHaveBeenCalled();
  });
  it('waits for the panel opacity transition to finish before recording the actual displayed message', async () => {
    const receipt = vi.fn(async () => {});
    const result = render(<div style={{ opacity: 0 }}><CustomerSupportMessage message={confirmed().acknowledgement}
      current={() => true} onRendered={receipt} /></div>);
    await visible(); expect(receipt).not.toHaveBeenCalled();
    const panel = result.container.firstElementChild as HTMLElement;
    panel.style.opacity = '1'; fireEvent.transitionEnd(panel);
    expect(receipt).toHaveBeenCalledTimes(1);
  });
  it('inbound message and status-only card produce no observer or receipt', () => {
    const receipt = vi.fn(async () => {});
    const prior = target;
    render(<><CustomerTicketStatus publicRef="SUP-42" status="resolved" nextAction="Customer-safe server status" />
      <CustomerSupportMessage message={{ id: 'inbound', version: 'v1', direction: 'inbound', body: 'User report' }}
        current={() => true} onRendered={receipt} /></>);
    expect(target).toBe(prior); expect(receipt).not.toHaveBeenCalled();
  });
});


describe('reachable guidance recovery boundaries', () => {
  it.each(['new-report', 'expired-copy'] as const)('%s never exposes or resends the prior proposal turn', async boundary => {
    const { session, port } = await mount();
    vi.mocked(port.guide).mockRejectedValueOnce(new Error('lost guidance'));
    fireEvent.change(screen.getByLabelText('Ask allAI about this report'), { target: { value: 'Old private question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to private guidance' }));
    await screen.findByText(/The result is unknown/);
    vi.mocked(port.recover).mockResolvedValue(proposal({ revision: 2,
      expires_at: boundary === 'expired-copy' ? '2000-01-01T00:00:00Z' : '2099-11-08T00:00:00Z' }));
    fireEvent.click(screen.getByRole('button', { name: /Recover/ }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Retry prior guidance turn' }) as HTMLButtonElement).disabled).toBe(false));
    expect(port.guide).toHaveBeenCalledTimes(1);
    vi.mocked(port.open).mockResolvedValue(proposal({ proposal_id: 'proposal-two', conversation_id: 'new-private-conversation' }));
    if (boundary === 'new-report') {
      fireEvent.click(screen.getByRole('checkbox', { name: /I have reviewed/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm and file report' }));
      await screen.findByText('Report confirmed');
      fireEvent.click(screen.getByRole('button', { name: /new report/i }));
    } else {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Copy this draft to a new proposal' }));
      fireEvent.click(screen.getByRole('button', { name: 'Create authorized copy' }));
    }
    await waitFor(() => expect(session.getSnapshot().proposal?.proposal_id).toBe('proposal-two'));
    const retry = screen.queryByRole('button', { name: 'Retry prior guidance turn' });
    if (retry) { fireEvent.click(retry); await waitFor(() => expect(session.getSnapshot().busy).toBe(false)); }
    expect(port.guide).toHaveBeenCalledTimes(1);
    expect(retry).toBeNull();
    if (boundary === 'expired-copy') {
      vi.mocked(port.save).mockImplementationOnce(async (_o, _p, revision, draft, surface) => proposal({
        proposal_id: 'proposal-two', conversation_id: 'new-private-conversation', revision: revision + 1, draft, surface }));
      fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
      await screen.findByText('Draft saved; not reported');
      expect(port.save).toHaveBeenCalledWith('order-fixture', 'proposal-two', 1, expect.any(Object), 'allai');
    }
  });
});
