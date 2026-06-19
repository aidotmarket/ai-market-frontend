import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ScopedCredentialDownload, {
  buildSyncCommand,
  isS3ScopedDeliveryResponse,
} from './ScopedCredentialDownload';
import type { S3ScopedDeliveryResponse } from '@/types';

const delivery: S3ScopedDeliveryResponse = {
  delivery_type: 's3_scoped_credential',
  download_number: 1,
  downloads_remaining: 4,
  s3_scoped_delivery: {
    access_key_id: 'AKIA_TEST',
    secret_access_key: 'SECRET_TEST',
    session_token: 'TOKEN_TEST',
    expiration: '2099-01-01T00:00:00Z',
    bucket: 'buyer-bucket',
    prefix: 'orders/order-123/',
    region: 'eu-west-1',
    sync_command_hint: '',
  },
};

describe('ScopedCredentialDownload helpers', () => {
  it('detects scoped delivery responses by delivery_type', () => {
    expect(isS3ScopedDeliveryResponse(delivery)).toBe(true);
    expect(isS3ScopedDeliveryResponse({ delivery_type: 'presigned_url' })).toBe(false);
  });

  it('builds sync commands with prefixes with or without trailing slash', () => {
    expect(buildSyncCommand('order-123456789', delivery.s3_scoped_delivery)).toBe(
      'aws s3 sync s3://buyer-bucket/orders/order-123 ./ai-market-order-order-12'
    );

    expect(buildSyncCommand('order-123456789', {
      ...delivery.s3_scoped_delivery,
      prefix: 'orders/order-123',
    })).toBe('aws s3 sync s3://buyer-bucket/orders/order-123 ./ai-market-order-order-12');
  });
});

describe('ScopedCredentialDownload component', () => {
  it('renders command, environment, and profile blocks', () => {
    const html = renderToString(
      <ScopedCredentialDownload orderId="order-123456789" delivery={delivery} onRefresh={async () => delivery} />
    );

    expect(html).toContain('Sync command');
    expect(html).toContain('aws s3 sync s3://buyer-bucket/orders/order-123 ./ai-market-order-order-12');
    expect(html).toContain('Environment variables');
    expect(html).toContain('AWS_ACCESS_KEY_ID=AKIA_TEST');
    expect(html).toContain('AWS_SECRET_ACCESS_KEY=SECRET_TEST');
    expect(html).toContain('AWS_SESSION_TOKEN=TOKEN_TEST');
    expect(html).toContain('AWS_DEFAULT_REGION=eu-west-1');
    expect(html).toContain('AWS profile');
    expect(html).toContain('[profile ai-market-order-order-12]');
  });

  it('shows the expired state and refresh button', () => {
    const html = renderToString(
      <ScopedCredentialDownload
        orderId="order-123456789"
        delivery={{
          ...delivery,
          s3_scoped_delivery: {
            ...delivery.s3_scoped_delivery,
            expiration: '2000-01-01T00:00:00Z',
          },
        }}
        onRefresh={async () => delivery}
      />
    );

    expect(html).toContain('These credentials have expired. Refresh credentials to continue.');
    expect(html).toContain('Refresh credentials');
  });
});
