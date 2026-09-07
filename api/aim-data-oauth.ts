import { api } from '@/api/client';
import { AIM_DATA_CONTINUATION } from '@/lib/redirect';
import { aimDataEnabled, requestPath } from '@/lib/aim-data-continuation';

export interface AuthorizationRequest {
  request: string;
  client_name: 'AIM Data';
  scope: 'aim_data.session';
  expires_at: string;
  csrf_nonce: string;
}

function requireRequest(request: string) {
  if (!aimDataEnabled() || !AIM_DATA_CONTINUATION.test(requestPath(request))) throw new Error('invalid_request');
}

export async function getAuthorization(request: string): Promise<AuthorizationRequest> {
  requireRequest(request);
  const { data } = await api.get<AuthorizationRequest>(`/oauth/authorize/requests/${request}`);
  if (data.request !== request || data.client_name !== 'AIM Data' || data.scope !== 'aim_data.session'
    || !/^[A-Za-z0-9_-]{43}(?![\s\S])/.test(data.csrf_nonce) || !Number.isFinite(Date.parse(data.expires_at))) {
    throw new Error('invalid_request');
  }
  return data;
}

export function validateLoopbackRedirect(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid_redirect');
  const match = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})\/api\/auth\/aim-market\/callback\?(?:code=[A-Za-z0-9_-]{43}|error=(?:access_denied|invalid_request|invalid_scope|unsupported_response_type|temporarily_unavailable))&state=[A-Za-z0-9_-]{43}(?![\s\S])/.exec(value);
  if (!match || Number(match[1]) < 1024 || Number(match[1]) > 65535) throw new Error('invalid_redirect');
  return value;
}

export async function decideAuthorization(request: string, csrf_nonce: string, decision: 'continue' | 'cancel') {
  requireRequest(request);
  const { data } = await api.post('/oauth/authorize', { request, csrf_nonce, decision });
  return validateLoopbackRedirect(data.redirect_url);
}
