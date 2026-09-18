# S1719 frontend no-content-gate implementation

Authority: `/var/tmp/koskadeux/s1719-max-decision-no-content-gate.md`.

Scope: browser viewer of seller-published verified sample previews. This branch
does not merge or deploy anything.

## Recorded implementation choices

1. Policy admission is an exact pair whitelist: legacy
   `aim-preview-policy-v1` / `1.0.0` and seller-attested
   `aim-preview-policy-v2` / `2.0.0`. Unknown or mismatched pairs fail closed.
   Neither accepted pair runs a browser content corpus. `scan_verdict=passed`,
   proof signatures, the scan-attestation digest, and the recomputed exact
   fetched-leaf-list digest remain required.
2. The following gates remain unchanged after direct code-path audit:
   - The platform envelope signature is verified before seller signing keys are
     admitted or used.
   - Seller disclosure, commitment, and per-proof signatures remain required.
   - Merkle inclusion is checked for every manifest proof and again for every
     fetched package row.
   - The ordered sample hash remains bound to both the signed proof order and
     the fetched package order.
   - Checkpoint signature, log inclusion, and predecessor consistency remain
     required.
   - A fresh manifest is fetched and fully reverified immediately before a
     display handle is issued.
   - Seller transport remains direct HTTPS with omitted credentials, no
     referrer, redirect refusal, public-host admission, and bounded streaming.
   - Optional column labels remain joined only after the signed-payload hash and
     signed revision identity match.
   - The package and table modules remain lazy-loaded only after explicit
     **View sample** activation.
   - Verified rows remain only in React component memory and are cleared on
     visibility/page lifecycle changes.

No production code change was needed for item 2; this audit is the item artifact.

## Item 4 transport inventory

Pending item 4 implementation and audit.

## Validation

Pending final validation.

## Risks and scope boundary

Pending final assessment.
