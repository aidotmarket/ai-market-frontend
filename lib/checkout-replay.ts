import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { LicenseAcceptanceFields } from '@/types';

export interface CheckoutReplay {
  acceptance: LicenseAcceptanceFields;
  checkoutRequestId?: string;
}

// Scope to this buyer and purchase. Only a one-way handoff fingerprint enters storage.
export function checkoutReplayKey(userId: string, listingId: string, versionId?: string, handoffToken?: string): string {
  const handoff = handoffToken ? bytesToHex(sha256(new TextEncoder().encode(handoffToken))) : 'direct';
  return `checkout_replay:${JSON.stringify([userId, listingId, versionId || '', handoff])}`;
}

export function saveCheckoutReplay(key: string, replay: CheckoutReplay): void {
  try { sessionStorage.setItem(key, JSON.stringify(replay)); } catch { /* In-memory replay remains usable. */ }
}

export function clearCheckoutReplay(key: string): void {
  try { sessionStorage.removeItem(key); } catch { /* Storage can be disabled. */ }
}

export function readCheckoutReplay(key: string, handoff: boolean): CheckoutReplay | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    const a = saved?.acceptance;
    if (!a || a.authority_confirmed !== true
      || !['accept_license_sha256', 'accept_covenant_sha256'].every(field => /^[a-f0-9]{64}$/.test(a[field]))
      || (a.accept_rider_sha256 != null && !/^[a-f0-9]{64}$/.test(a.accept_rider_sha256))
      || !['typed_name', 'signer_title', 'business_legal_name'].every(field => typeof a[field] === 'string' && a[field].trim())
      || !/^[A-Z]{2}$/.test(a.jurisdiction)
      || (!handoff && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(saved.checkoutRequestId))) return null;
    // Restore only known acceptance fields; never credentials or submitted CSRF.
    return { acceptance: {
      accept_license_sha256: a.accept_license_sha256, accept_covenant_sha256: a.accept_covenant_sha256,
      accept_rider_sha256: a.accept_rider_sha256, authority_confirmed: true, typed_name: a.typed_name,
      signer_title: a.signer_title, business_legal_name: a.business_legal_name, jurisdiction: a.jurisdiction,
    }, ...(!handoff ? { checkoutRequestId: saved.checkoutRequestId } : {}) };
  } catch { return null; }
}
