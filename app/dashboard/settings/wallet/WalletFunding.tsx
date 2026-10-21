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

// Presentation only: display the supplied instant in the viewer's local time.
const walletDate = (value: string) => new Date(value).toLocaleString('en-US', {
  year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

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
  return <div className="w-full min-w-0 max-w-6xl space-y-6 text-gray-900">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Marketplace wallet</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">Fund your existing marketplace wallet for purchases. This is separate from AI/API credits and seller payouts.</p>
      </div>
      {ready && <button type="button" onClick={() => actions.current?.refresh()} className="min-h-11 shrink-0 self-start rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3F51B5] focus-visible:ring-offset-2">Refresh</button>}
    </header>
    {returnHint === 'return' && <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><p>Returned from checkout. Check your wallet history for updates.</p><p>A return alone does not confirm payment or wallet credit.</p></div>}
    {returnHint === 'cancelled' && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Checkout was closed. Payment and wallet credit are not confirmed here.</p>}
    {attemptUI === 'unknown' && <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium leading-6 text-amber-950">{uncertain}</p>}
    {!ready && <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"><p role="status" className="text-sm leading-6 text-gray-700">{view.status || 'Waiting to verify wallet sign-in.'}</p>
      <button type="button" disabled={recovering} onClick={() => actions.current?.recover()} className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3F51B5] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">Recover sign-in</button></div>}
    {ready && <>
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <section aria-label="Balance" className="min-w-0 rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Available balance</h2>
            <span className="rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-medium text-[#3F51B5]">USD wallet</span>
          </div>
          {view.balance.loading && <p role="status" className="mt-5 text-sm text-gray-600">Loading balance…</p>}
          {view.balance.error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{view.balance.error}</p>}
          {!view.balance.data && !view.balance.loading && <p className="mt-5 text-lg font-medium text-gray-600">Balance unavailable</p>}
          {view.balance.data && <>
            <p className="mt-6 break-words text-3xl font-semibold tracking-tight text-[#3F51B5] tabular-nums sm:text-4xl">{money(view.balance.data.balance_cents)}</p>
            <p className="mt-4 text-xs leading-5 text-gray-600">{view.balance.error || view.balance.loading ? 'Stale — ' : ''}Balance last refreshed: {view.balance.at && <time dateTime={view.balance.at} title={view.balance.at}>{walletDate(view.balance.at)}</time>}</p>
          </>}
          <p className="mt-5 border-t border-indigo-100 pt-4 text-sm leading-6 text-gray-600">For marketplace purchases. Balance and transaction history refresh independently.</p>
        </section>
        <form aria-label="Fund wallet" onSubmit={e => { e.preventDefault(); actions.current?.submit(amount); }} className="min-w-0 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold">Add funds</h2>
          <p id="wallet-amount-help" className="mt-2 text-sm leading-6 text-gray-600">Enter USD 5.00 to USD 1,000,000.00, with up to two decimal places.</p>
          <div className="mt-5">
            <label htmlFor="wallet-amount" className="mb-2 block text-sm font-medium text-gray-700">Amount (USD)</label>
            <input id="wallet-amount" type="text" inputMode="decimal" value={amount} disabled={locked} onChange={e => setAmount(e.target.value)} aria-describedby="wallet-amount-help" className="min-h-12 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 tabular-nums focus:border-[#3F51B5] focus:outline-none focus:ring-2 focus:ring-[#3F51B5] disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500" />
          </div>
          <button type="submit" disabled={locked} className="mt-4 min-h-12 w-full rounded-lg bg-[#3F51B5] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3545a0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3F51B5] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">Continue to checkout</button>
          {attemptUI === 'pending' && <p role="status" className="mt-3 text-sm text-gray-600">Creating checkout…</p>}
          {attemptUI === 'handoff' && <p role="status" className="mt-3 text-sm text-gray-600">Continuing to checkout…</p>}
          {formError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">{formError}</p>}
        </form>
      </div>
      <section aria-label="Transaction history" className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="space-y-3 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Transaction history</h2>
          {view.history.loading && <p role="status" className="text-sm text-gray-600">Loading transaction history…</p>}
          {view.history.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{view.history.error}</p>}
          {view.history.data && <p className="text-xs leading-5 text-gray-600">{view.history.error || view.history.loading ? 'Stale — ' : ''}History last refreshed: {view.history.at && <time dateTime={view.history.at} title={view.history.at}>{walletDate(view.history.at)}</time>}</p>}
        </div>
        {view.history.data && <>
          {view.history.data.transactions.length === 0 ? <div className="border-y border-gray-100 bg-gray-50 px-5 py-10 text-center sm:px-6"><p className="text-sm font-medium text-gray-700">No recorded transactions on this page.</p><p className="mt-2 text-sm text-gray-600">An empty history does not confirm a payment outcome.</p></div> :
            <div role="region" aria-label="Wallet transactions table" tabIndex={0} className="overflow-x-auto border-y border-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3F51B5]">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Recorded wallet transactions. Amounts and balances in USD; dates in your local time zone.</caption>
                <thead className="bg-gray-50 text-xs font-semibold text-gray-600"><tr>
                  <th scope="col" className="px-6 py-4">Date</th><th scope="col" className="px-6 py-4">Type</th><th scope="col" className="px-6 py-4 text-right">Amount</th><th scope="col" className="px-6 py-4 text-right">Balance after</th><th scope="col" className="px-6 py-4">Description</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">{view.history.data.transactions.map(row => <tr key={row.id} data-transaction-id={row.id} className="align-top hover:bg-gray-50/60">
                  <td className="whitespace-nowrap px-6 py-5 text-gray-600"><time dateTime={row.created_at} title={row.created_at}>{walletDate(row.created_at)}</time></td><td className="whitespace-nowrap px-6 py-5 capitalize text-gray-700">{row.transaction_type.replace('_', ' ')}</td>
                  <td className="whitespace-nowrap px-6 py-5 text-right font-medium text-gray-900 tabular-nums">{money(row.amount_cents, true)}</td><td className="whitespace-nowrap px-6 py-5 text-right text-gray-600 tabular-nums">{money(row.balance_after_cents)}</td><td className="min-w-48 max-w-sm break-words px-6 py-5 text-gray-600">{row.description}</td>
                </tr>)}</tbody>
              </table>
            </div>}
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <p className="max-w-xl text-xs leading-5 text-gray-600"><span className="font-semibold text-gray-900">Page {view.offset / 20 + 1}.</span> Transactions can shift between pages as new activity is recorded. Missing history does not confirm a payment outcome.</p>
            <div className="flex shrink-0 gap-2">
              <button type="button" disabled={view.history.loading || view.offset === 0} onClick={() => actions.current?.page(view.offset - 20)} className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3F51B5] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
              <button type="button" disabled={view.history.loading || !view.history.data.has_more} onClick={() => actions.current?.page(view.offset + 20)} className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3F51B5] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
            </div>
          </div>
        </>}
      </section>
      <p className="max-w-3xl text-xs leading-5 text-gray-600">Checkout, payment and wallet credit are separate steps. A return or missing transaction does not establish whether another payment is safe.</p>
    </>}
  </div>;
}
