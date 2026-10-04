// Only the listing destination is retained here, never payment return values.
const key = 'data-verification:listing-return';
interface Destination { sellerId: string; listingId: string }
export function saveVerificationReturn(destination?: Destination) {
  if (destination) window.sessionStorage.setItem(key, JSON.stringify(destination));
  else window.sessionStorage.removeItem(key);
}
export function getVerificationReturn(sellerId?: string): string | null {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key) ?? 'null');
    if (saved?.sellerId !== sellerId || !sellerId || typeof saved?.listingId !== 'string' || !saved.listingId) return null;
    return `/dashboard/listings/${encodeURIComponent(saved.listingId)}`;
  } catch { return null; }
}
