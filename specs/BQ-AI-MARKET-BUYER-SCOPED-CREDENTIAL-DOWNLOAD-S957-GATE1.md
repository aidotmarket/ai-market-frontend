# BQ-AI-MARKET-BUYER-SCOPED-CREDENTIAL-DOWNLOAD-S957 Gate 1

## Scope

Frontend-only buyer download support for fulfilled orders delivered with scoped S3 credentials. Backend endpoints are already implemented and are consumed without backend changes.

## Backend Contract

- Initial access: `POST /api/v1/orders/{order_id}/download`
- Scoped refresh: `POST /api/v1/orders/{order_id}/delivery/refresh`
- Scoped response shape:

```ts
{
  delivery_type: 's3_scoped_credential';
  s3_scoped_delivery: {
    access_key_id: string;
    secret_access_key: string;
    session_token: string;
    expiration: string;
    bucket: string;
    prefix: string | null;
    region?: string | null;
    sync_command_hint: string;
  };
  download_number: number;
  downloads_remaining: number;
}
```

Legacy presigned downloads remain on the existing file-list path and refresh with `POST /api/v1/orders/{order_id}/refresh`.

## UX

- Fulfilled orders request download access on page load.
- Scoped responses render:
  - one copyable `aws s3 sync` command, preferring `sync_command_hint`
  - copyable environment variables
  - copyable `aws configure` profile snippet
  - live expiration countdown with expired state
  - refresh button that disables only while refresh is in flight
  - numbered setup steps
- Legacy responses continue to render the presigned file list.

## Security

- Credential values are kept only in React component state.
- Credential values are never logged.
- Credential values are not written to localStorage, sessionStorage, or URLs.

## Validation

- Add Vitest coverage for:
  - scoped response type guard
  - sync command builder prefix normalization
  - component command/environment/profile rendering
  - expired state and refresh affordance
