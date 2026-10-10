'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useSellerSwitches, type SellerSwitchReport } from '@/hooks/useSellerSwitches';
import { fields, verbs, newDecision, nativeSession, readAuthority, reviewAuthority, setAuthority, reviewStopAuthority, stopAuthority, validLimits, type AuthoritySet, type AuthorityStatus, type DecisionReview, type StandingLimits, type WebDecision } from '@/api/connector-seller-settings';
import NativeSellerAuth from '@/components/NativeSellerAuth';

const empty: StandingLimits = { grant_ids: [], client_ids: [], operations: [], categories: [], source_kinds: [], connection_ids: [], mutable_fields: [], max_batch: 1,
  daily_items: {}, concurrent_operations: 1, price_min_cents: null, price_max_cents: null, max_price_delta_cents: null, currency: 'USD', sample_rule: 'none_or_unchanged_approved', expires_at: '' };
const lists = ['grant_ids', 'client_ids', 'categories', 'connection_ids'] as const;
const names = { grant_ids: 'Selected native grants (UUIDs)', client_ids: 'Selected native client IDs', categories: 'Categories', connection_ids: 'Owned connections (UUIDs)' };
export default function SellerAuthority() {
  const switches = useSellerSwitches();
  const { user, token } = useAuthStore();
  if (!user || !token) return null;
  return <AuthorityScreen key={user.id} switches={switches} />;
}
export function AuthorityScreen({ switches }: { switches: SellerSwitchReport | null }) {
  const token = useAuthStore(s => s.token);
  const effects = switches?.seller === true && switches.effects === true;
  const [stopReview, setStopReview] = useState<{ body: WebDecision; result: DecisionReview<WebDecision> } | null>(null);
  const [status, setStatus] = useState<AuthorityStatus | null>(null);
  const [limits, setLimits] = useState<StandingLimits>(empty);
  const [review, setReview] = useState<{ body: AuthoritySet; result: DecisionReview<AuthoritySet> } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(true); const pending = useRef<AuthoritySet | null>(null);
  const stopping = useRef<ReturnType<typeof newDecision> | null>(null);
  const refresh = async () => { setStopReview(null); setReview(null); pending.current = null; try { const data = await readAuthority(); if (mounted.current) { setStatus(data); setLimits(data.limits && validLimits(data.limits) ? data.limits : empty); setError(null); } } catch(e) { if (mounted.current) setError(e); } };
  useEffect(() => { mounted.current = true; setStatus(null); setLimits(empty); void refresh(); return () => { mounted.current = false; }; }, [token]);
  const edit = (next: StandingLimits) => { stopping.current = null; setStopReview(null); setLimits(next); setReview(null); pending.current = null; setMessage(''); };
  const prepare = async (reauth?: string) => {
    if (!status || busy || !effects || !validLimits(limits) || Date.parse(limits.expires_at) <= Date.now()) return;
    if (!reauth) { stopping.current = null; setStopReview(null); }
    setBusy(true); setError(null);
    try { const body = pending.current ?? { ...newDecision(status.version), limits: structuredClone(limits) }; pending.current = body;
      if (reauth) body.reauth_token = reauth;
      const result = await reviewAuthority(body); if (mounted.current) setReview({ body, result });
    } catch(e) { if (mounted.current) setError(e); } finally { if (mounted.current) setBusy(false); }
  };
  const save = async () => {
    if (!review || busy || !effects) return;
    setBusy(true); setError(null);
    try { await setAuthority({ ...review.body, review_hash: review.result.review_hash }); if (mounted.current) { setMessage('Standing authority saved.'); await refresh(); } }
    catch(e) { if (mounted.current) { setError(e); setReview(null); } } finally { if (mounted.current) setBusy(false); }
  };
  const stop = async (reauth?: string) => {
    if (!status || busy) return;
    setBusy(true); setError(null); setReview(null); pending.current = null; setStopReview(null);
    try {
      if (stopping.current?.expected_version !== status.version) stopping.current = null;
      stopping.current ??= newDecision(status.version);
      const csrf = nativeSession().csrf;
      const body = { ...stopping.current, csrf, reauth_token: reauth ?? (stopping.current.csrf === csrf ? stopping.current.reauth_token : undefined) };
      stopping.current = body;
      const result = await reviewStopAuthority(body);
      if (mounted.current) setStopReview({ body, result });
    } catch(e) { if (mounted.current) setError(e); }
    finally { if (mounted.current) setBusy(false); }
  };
  const confirmStop = async () => {
    if (!stopReview || busy) return;
    setBusy(true); setError(null);
    try { await stopAuthority({ ...stopReview.body, review_hash: stopReview.result.review_hash });
      if (mounted.current) { stopping.current = null; setMessage('Standing authority revoked. Completed effects remain completed.'); await refresh(); }
    } catch(e) { if (mounted.current) { setError(e); setStopReview(null); } }
    finally { if (mounted.current) setBusy(false); }
  };
  return <section id="seller-authority" aria-label="Seller standing authority" className="mt-6 space-y-4 rounded-xl border bg-white p-6">
    <h2 className="text-lg font-semibold">Seller standing authority</h2>
    <button type="button" disabled={!status || busy} onClick={() => void stop()} className="rounded border border-red-700 px-4 py-2 text-red-800">Stop automatic seller actions</button>
    <p>After authenticated review and confirmation, Stop revokes standing authority immediately for unexecuted items. Successful items remain completed.</p>
    <button type="button" onClick={() => { stopping.current = null; void refresh(); }}>Refresh authority and budget</button>
    {stopReview && <section aria-label="Exact server Stop review"><h3>Review withdrawal of standing authority</h3><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(stopReview.result, null, 2)}</pre><button disabled={busy} onClick={() => void confirmStop()}>Confirm Stop automatic seller actions</button></section>}
    {message && <p role="status">{message}</p>}
    {status && <><p>Authority version {status.version} · {status.enabled ? 'Active' : 'Off or expired'} · UTC day {status.utc_day}</p>
      <p>Single and bulk actions share this budget across all grants and clients. Absolute request ceiling: 50 items. Requests are never automatically split.</p>
      <table><caption>Shared UTC daily budget</caption><thead><tr><th>Operation</th><th>Limit</th><th>Reserved</th><th>Succeeded</th><th>Remaining</th></tr></thead><tbody>{verbs.map(v => {
        const used = status.usage.find(u => u.action === `aim.listing.${v}`); const limit = status.limits?.daily_items?.[v] ?? 0;
        return <tr key={v}><th>{v}</th><td>{limit}</td><td>{used?.reserved ?? 0}</td><td>{used?.success ?? 0}</td><td>{Math.max(0, limit - (used?.reserved ?? 0) - (used?.success ?? 0))}</td></tr>;
      })}</tbody></table>
      {!effects && <p>Seller effects are off. Status and Stop remain available.</p>}
      {effects && <><form onSubmit={e => { e.preventDefault(); void prepare(); }} className="space-y-4">
        <fieldset disabled={busy || !effects} className="grid gap-4 sm:grid-cols-2"><legend>Edit standing limits</legend>
          {lists.map(k => <label key={k}>{names[k]} (one per line)<textarea className="block w-full rounded border p-2" value={limits[k].join('\n')} onChange={e => edit({ ...limits, [k]: e.target.value.split('\n').filter(Boolean) })} /></label>)}
          {verbs.map(v => <div key={v}><label><input type="checkbox" checked={limits.operations.includes(v)} onChange={e => {
            const daily = { ...limits.daily_items }; if (e.target.checked) daily[v] = 1; else delete daily[v];
            edit({ ...limits, operations: e.target.checked ? [...limits.operations, v] : limits.operations.filter(x => x !== v), daily_items: daily });
          }} />{v}</label>{limits.operations.includes(v) && <label>Daily {v} items<input className="block rounded border p-2" type="number" min="1" max="1000000" value={limits.daily_items[v] ?? 1} onChange={e => edit({ ...limits, daily_items: { ...limits.daily_items, [v]: Number(e.target.value) } })} /></label>}</div>)}
          {(['aws', 'r2', 'gateway', 'none'] as const).map(v => <label key={v}><input type="checkbox" checked={limits.source_kinds.includes(v)} onChange={e => edit({ ...limits, source_kinds: e.target.checked ? [...limits.source_kinds, v] : limits.source_kinds.filter(x => x !== v) })} />Source: {v}</label>)}
          {fields.map(v => <label key={v}><input type="checkbox" checked={limits.mutable_fields.includes(v)} onChange={e => edit({ ...limits, mutable_fields: e.target.checked ? [...limits.mutable_fields, v] : limits.mutable_fields.filter(x => x !== v) })} />Mutable field: {v}</label>)}
          {(['max_batch', 'concurrent_operations', 'price_min_cents', 'price_max_cents', 'max_price_delta_cents'] as const).map(k => <label key={k}>{k.replaceAll('_', ' ')}<input className="block rounded border p-2" type="number" min={k === 'max_batch' || k === 'concurrent_operations' ? 1 : 0} max={k === 'max_batch' || k === 'concurrent_operations' ? 50 : undefined} value={limits[k] ?? ''} onChange={e => edit({ ...limits, [k]: e.target.value === '' ? null : Number(e.target.value) })} /></label>)}
          <label>Expiry (ISO timestamp with UTC offset)<input className="block rounded border p-2" value={limits.expires_at} onChange={e => edit({ ...limits, expires_at: e.target.value })} /></label>
          <p>Currency USD. Samples must be absent or unchanged and already approved. New presentation or sample content still requires web review. Limits never sign licences.</p>
        </fieldset>
        <button type="submit" disabled={busy || !effects || !validLimits(limits) || Date.parse(limits.expires_at) <= Date.now()}>Review exact standing limits</button>
      </form>
      {review && <section aria-label="Exact server authority review"><h3>Exact native decision</h3><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(review.result, null, 2)}</pre><button disabled={busy || !effects} onClick={() => void save()}>Save reviewed standing authority</button></section>}
      </>}
    </>}
    <NativeSellerAuth error={error} onRetry={() => { if (stopping.current) void stop(); else void refresh(); }} onToken={async proof => { if (stopping.current) await stop(proof); else await prepare(proof); }} />
  </section>;
}
