# S1716 S1294 T frontend

Status: implementation in progress; not merged or deployed.

## Preconditions

- Backend origin/main verified at ea7e777c1ee2a9925db1b221430937cd38694ad5. Deployment and Alembic head s1716_preview_disclosure are supplied by the task, not independently probed here.
- Approved producer: aim-data e574e1df, stable aim-data-v1.24.0 (task authority).
- Production platform signing keys are not provisioned; keys route currently 503 (task authority). Missing keys must produce no preview.
- Frontend base: c23d6798ce5a484e6145a6d14195c328c5e8405c, fetched origin/main.
- All backend tests/fixtures/preview files copied byte-identically from the backend pin; SHA-256 inventory: s1716-preview-corpus-shas.json.
- Relevant runbooks read: backend docs/runbooks/listing-summary.md; runbooks/aim-data-seller-publish-journey.md. A scoped browser procedure will accompany this report.

## Open integration questions

The pinned producer policy requires Presidio 2.2.362 / spaCy 3.7.2 / en-core-web-sm 3.7.1. The contract does not supply a browser equivalent. Display must fail closed on incomplete detector coverage. No policy relaxation is assumed.
