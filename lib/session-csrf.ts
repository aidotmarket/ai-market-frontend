import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Matches pending_actions.session_csrf, shared by pending actions and checkout. */
export function sessionCsrf(accessToken: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(`aim.pending.csrf.v1\0${accessToken}`)));
}
