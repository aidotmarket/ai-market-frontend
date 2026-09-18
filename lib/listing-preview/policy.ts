import {requirePreview as check} from './primitives';

/** Exact scan-attestation wire identities accepted by the viewer. Both are
 * seller attestations whose signatures and sampled-leaf binding are verified;
 * neither authorizes browser-side content judgement. */
export const ACCEPTED_POLICY_VERSIONS = {
  'aim-preview-policy-v1': '1.0.0',
  'aim-preview-policy-v2': '2.0.0',
} as const;

export type PreviewPolicy = keyof typeof ACCEPTED_POLICY_VERSIONS;
export const LEGACY_POLICY: PreviewPolicy = 'aim-preview-policy-v1';
export const SELLER_ATTESTED_POLICY: PreviewPolicy = 'aim-preview-policy-v2';

export function requirePolicyVersion(policy: string, version: string): asserts policy is PreviewPolicy {
  check(Object.hasOwn(ACCEPTED_POLICY_VERSIONS, policy)
    && ACCEPTED_POLICY_VERSIONS[policy as PreviewPolicy] === version, 'scan_policy_unknown');
}
