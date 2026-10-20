'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  createWalletTopup, getWalletBalance, getWalletHistory, parseWalletAmount,
  resolveWalletOwner, walletStatus, type WalletBalance, type WalletHistory,
} from '@/api/wallet';

type Auth = ReturnType<typeof useAuthStore.getState>;
type Association = { token: string; owner: string; generation: object; abort: AbortController; verified: boolean };
type Read<T> = { data?: T; loading: boolean; error?: string; at?: string };
type View = {
  association?: Association;
  status: string;
  balance: Read<WalletBalance>;
  history: Read<WalletHistory>;
  offset: number;
};
type Actions = { submit: (text: string) => void; refresh: () => void; page: (offset: number) => void; recover: () => void };
const admitted = (s: Auth) => !!(s.hydrated && !s.isLoading && s.isAuthenticated && s.token && s.user?.id);
const blank = (status: string): View => ({ status, balance: { loading: false }, history: { loading: false }, offset: 0 });
const blocked = 'Wallet blocked. Your sign-in could not be verified for this wallet. Recover sign-in to try again.';
const uncertain = "We couldn't confirm whether checkout was created. Wallet history may show recorded credits, but cannot tell whether starting another payment is safe.";
const money = (value: number, signed = false) => {
  const digits = String(Math.abs(value)).padStart(3, '0');
  return `${signed && value >= 0 ? '+' : value < 0 ? '−' : ''}USD ${digits.slice(0, -2)}.${digits.slice(-2)}`;
};

export default function WalletFunding() {
  const auth = useAuthStore();
  const [view, setView] = useState<View>(() => blank('Waiting to verify wallet sign-in.'));
  const [amount, setAmount] = useState('');
  const [formError, setFormError] = useState('');
  const [attemptUI, setAttemptUI] = useState<'idle' | 'pending' | 'unknown' | 'handoff'>('idle');
  // Monetary safety is independent of auth associations and effect restarts.
  const attempt = useRef<'idle' | 'pending' | 'unknown' | 'handoff'>('idle');
  const liveAssociation = useRef<Association | undefined>(undefined);
  const actions = useRef<Actions | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [returnHint, setReturnHint] = useState<string | null>(null);

  useEffect(() => {
    setReturnHint(new URLSearchParams(window.location.search).get('topup'));
    let alive = true;
    let association: Association | undefined;
    let lastToken: string | null | undefined;
    let lastOwner: string | undefined;
    let lastAdmission: boolean | undefined;
    let recovery = false;
    let historySequence = 0;
    let balanceSequence = 0;
    let historyBusy = false;
    let balanceBusy = false;
    let currentOffset = 0;

    const current = (a: Association, verified = true) => {
      const s = useAuthStore.getState();
      return alive && !recovery && association === a && association.generation === a.generation
        && (!verified || a.verified) && admitted(s) && s.token === a.token && s.user?.id === a.owner;
    };
    const revoke = (status: string) => {
      association?.abort.abort();
      association = undefined; // object/generation cannot be revived by A -> B -> A
      liveAssociation.current = undefined;
      historySequence++;
      balanceSequence++;
      historyBusy = false;
      balanceBusy = false;
      currentOffset = 0;
      if (attempt.current === 'pending' || attempt.current === 'handoff') {
        attempt.current = 'unknown';
        setAttemptUI('unknown');
      }
      setAmount('');
      setFormError('');
      setView(blank(status));
    };
    const readFailure = (a: Association, error: unknown) => {
      if (!current(a)) return true;
      if (walletStatus(error) === 401) { revoke(blocked); return true; }
      return false;
    };
    const balance = async (a: Association) => {
      if (!current(a) || balanceBusy) return;
      balanceBusy = true;
      const seq = ++balanceSequence;
      setView(v => ({ ...v, balance: { ...v.balance, loading: true, error: undefined } }));
      try {
        if (!current(a)) return;
        const data = await getWalletBalance(a.token, a.owner, a.abort.signal);
        if (!current(a) || seq !== balanceSequence) return;
        setView(v => ({ ...v, balance: { data, loading: false, at: new Date().toISOString() } }));
      } catch (error) {
        if (seq !== balanceSequence || readFailure(a, error)) return;
        setView(v => ({ ...v, balance: { ...v.balance, loading: false, error: 'Balance could not be loaded.' } }));
      } finally { if (current(a) && seq === balanceSequence) balanceBusy = false; }
    };
    const history = async (a: Association, offset: number, refresh = false) => {
      if (!current(a) || (historyBusy && !refresh) || !Number.isSafeInteger(offset) || offset < 0) return;
      historyBusy = true;
      const seq = ++historySequence;
      setView(v => ({ ...v, history: { ...v.history, loading: true, error: undefined } }));
      try {
        if (!current(a)) return;
        const data = await getWalletHistory(a.token, offset, a.abort.signal);
        if (!current(a) || seq !== historySequence) return;
        currentOffset = offset;
        setView(v => ({ ...v, offset, history: { data, loading: false, at: new Date().toISOString() } }));
      } catch (error) {
        if (seq !== historySequence || readFailure(a, error)) return;
        setView(v => ({ ...v, history: { ...v.history, loading: false, error: 'Transaction history could not be loaded.' } }));
      } finally { if (current(a) && seq === historySequence) historyBusy = false; }
    };
    const resolve = async () => {
      const s = useAuthStore.getState();
      if (!alive || recovery || !admitted(s)) return;
      const a: Association = { token: s.token!, owner: s.user!.id, generation: {}, abort: new AbortController(), verified: false };
      association = a;
      liveAssociation.current = a;
      setView(blank('Verifying wallet sign-in.'));
      try {
        if (!current(a, false)) return;
        const owner = await resolveWalletOwner(a.token, a.abort.signal);
        if (!current(a, false)) return;
        if (owner !== a.owner) { revoke(blocked); return; }
        a.verified = true;
        setView({ ...blank(''), association: a });
        void balance(a);
        void history(a, 0);
      } catch {
        if (current(a, false)) revoke(blocked);
      }
    };
    const reconcile = () => {
      const s = useAuthStore.getState();
      const ready = admitted(s);
      if (s.token === lastToken && s.user?.id === lastOwner && ready === lastAdmission) return;
      lastToken = s.token; lastOwner = s.user?.id; lastAdmission = ready;
      revoke('Waiting to verify wallet sign-in.');
      if (ready && !recovery) void resolve();
    };
    // Zustand fires this synchronously, before React can render or run effects.
    const unsubscribe = useAuthStore.subscribe(reconcile);
    reconcile();

    actions.current = {
      refresh: () => { const a = association; if (a && current(a)) { void balance(a); void history(a, 0, true); } },
      page: offset => {
        const a = association;
        if (a && current(a) && Math.abs(offset - currentOffset) === 20) void history(a, offset);
      },
      recover: async () => {
        if (!alive || recovery) return;
        recovery = true;
        setRecovering(true);
        revoke('Recovering wallet sign-in.');
        try { await useAuthStore.getState().refreshAuth(); } catch { /* wallet remains blocked until exact resolution */ }
        if (!alive) return;
        recovery = false;
        setRecovering(false);
        // Always freshly resolve even if refresh kept the same token/user.
        if (admitted(useAuthStore.getState())) void resolve();
        else revoke(blocked);
      },
      submit: async text => {
        const a = association;
        if (!a || !current(a) || attempt.current !== 'idle') return;
        const value = parseWalletAmount(text);
        if (value === null) { setFormError('Enter a USD amount from 5.00 to 1000000.00, with at most two decimal places.'); return; }
        setFormError('');
        // Acquire before dispatch/await. No auth or read operation releases this guard.
        attempt.current = 'pending';
        setAttemptUI('pending');
        try {
          if (!current(a)) { attempt.current = 'unknown'; setAttemptUI('unknown'); return; }
          const url = await createWalletTopup(a.token, value, window.location.origin, a.abort.signal);
          if (!current(a)) return;
          attempt.current = 'handoff';
          setAttemptUI('handoff');
          if (current(a)) window.location.assign(url);
        } catch (error) {
          if (!current(a)) return;
          const status = walletStatus(error);
          if (status !== undefined && [400, 401, 403, 422].includes(status)) {
            attempt.current = 'idle';
            setAttemptUI('idle');
            if (status === 401 || status === 403) revoke(blocked);
            else setFormError('Checkout was rejected. Check the amount before submitting again.');
          } else {
            attempt.current = 'unknown';
            setAttemptUI('unknown');
          }
        }
      },
    };
    return () => {
      alive = false;
      unsubscribe();
      association?.abort.abort();
      association = undefined;
      liveAssociation.current = undefined;
      actions.current = null;
      if (attempt.current !== 'idle') { attempt.current = 'unknown'; setAttemptUI('unknown'); }
    };
  }, []);

  const ready = admitted(auth) && view.association === liveAssociation.current && !!view.association?.verified
    && view.association.token === auth.token && view.association.owner === auth.user?.id;
  const locked = !ready || attemptUI !== 'idle';
  return <div className="max-w-3xl space-y-6">
    <h1 className="text-2xl font-bold">Marketplace wallet</h1>
    <p>Fund your existing marketplace wallet for purchases. This is separate from AI/API credits and seller payouts.</p>
    {returnHint === 'return' && <p>Returned from checkout. Check your wallet history for updates.</p>}
    {returnHint === 'cancelled' && <p>Checkout was closed. Payment and wallet credit are not confirmed here.</p>}
    {attemptUI === 'unknown' && <p role="alert">{uncertain}</p>}
    {!ready && <div><p role="status">{view.status || 'Waiting to verify wallet sign-in.'}</p>
      <button type="button" disabled={recovering} onClick={() => actions.current?.recover()}>Recover sign-in</button></div>}
    {ready && <>
      <button type="button" onClick={() => actions.current?.refresh()}>Refresh</button>
      <section aria-label="Balance"><h2>Balance</h2>
        {view.balance.loading && <p role="status">Loading balance…</p>}
        {view.balance.error && <p role="alert">{view.balance.error}</p>}
        {view.balance.data && <><p>{money(view.balance.data.balance_cents)}</p><p>{view.balance.error || view.balance.loading ? 'Stale — ' : ''}Balance last refreshed: {view.balance.at}</p></>}
      </section>
      <form aria-label="Fund wallet" onSubmit={e => { e.preventDefault(); actions.current?.submit(amount); }}>
        <label htmlFor="wallet-amount">Amount (USD)</label>
        <input id="wallet-amount" type="text" inputMode="decimal" value={amount} disabled={locked} onChange={e => setAmount(e.target.value)} className="border rounded px-3 py-2" />
        <button type="submit" disabled={locked}>Continue to checkout</button>
        {attemptUI === 'pending' && <p role="status">Creating checkout…</p>}
        {attemptUI === 'handoff' && <p role="status">Continuing to checkout…</p>}
        {formError && <p role="alert">{formError}</p>}
      </form>
      <section aria-label="Transaction history"><h2>Transaction history</h2>
        {view.history.loading && <p role="status">Loading transaction history…</p>}
        {view.history.error && <p role="alert">{view.history.error}</p>}
        {view.history.data && <>
          <p>{view.history.error || view.history.loading ? 'Stale — ' : ''}History last refreshed: {view.history.at}</p>
          {view.history.data.transactions.length === 0 ? <p>No recorded transactions on this page.</p> :
            <table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Description</th></tr></thead>
              <tbody>{view.history.data.transactions.map(row => <tr key={row.id} data-transaction-id={row.id}>
                <td><time dateTime={row.created_at}>{row.created_at}</time></td><td>{row.transaction_type}</td>
                <td>{money(row.amount_cents, true)}</td><td>{money(row.balance_after_cents)}</td><td>{row.description}</td>
              </tr>)}</tbody></table>}
          <p>Page {view.offset / 20 + 1}. Transactions can shift between pages as new activity is recorded. Missing history does not confirm a payment outcome.</p>
          <button type="button" disabled={view.history.loading || view.offset === 0} onClick={() => actions.current?.page(view.offset - 20)}>Previous</button>
          <button type="button" disabled={view.history.loading || !view.history.data.has_more} onClick={() => actions.current?.page(view.offset + 20)}>Next</button>
        </>}
      </section>
    </>}
  </div>;
}
