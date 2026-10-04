import { AxiosError } from 'axios';
import type { User } from '@/types';
import type { CapabilityStep } from '@/api/capabilities';
import { SSO_MANAGED_2FA_MESSAGE } from '@/api/auth';

export function providerSecurityMessage(user: User | null | undefined): string {
  const provider = user?.two_factor_provider === 'google' ? 'Google' : user?.two_factor_provider === 'github' ? 'GitHub' : 'identity provider';
  return `Sign-in security is managed by your ${provider} account.`;
}

export function setupRestriction(user: User | null | undefined): string | null {
  // An existing native factor keeps its controls, even during provider sign-in.
  if (user?.totp_enabled) return null;
  if (user?.two_factor_setup_reason === 'two_factor_managed_by_provider') return providerSecurityMessage(user);
  if (user?.two_factor_setup_reason === 'two_factor_managed_by_sso') return SSO_MANAGED_2FA_MESSAGE;
  if (user?.two_factor_setup_eligible === false) return 'Authenticator setup is unavailable for this session. Refresh your account settings.';
  // Compatibility with the pre-policy enforced-SSO contract. Account provider
  // links and primary_auth never establish current provider-session assurance.
  if (user?.two_factor_setup_eligible === undefined && user?.sso_enforced && !user.auth_methods?.includes('password')) return SSO_MANAGED_2FA_MESSAGE;
  return null;
}

export function setupRefusal(error: unknown, user: User | null | undefined): string | null {
  if (!(error instanceof AxiosError) || error.response?.status !== 409) return null;
  if (error.response.data?.detail === 'two_factor_managed_by_provider') return providerSecurityMessage(user);
  if (error.response.data?.detail === 'two_factor_managed_by_sso') return SSO_MANAGED_2FA_MESSAGE;
  return null;
}

export function accountReauthMethod(user: User | null | undefined): 'password' | 'totp' | 'magic_link' {
  if (user?.reauth_method === 'totp' || user?.reauth_method === 'password' || user?.reauth_method === 'magic_link') return user.reauth_method;
  // Older-server fallback preserves the existing credential flow, with no
  // assumption that linked Google/GitHub methods identify this session.
  return user?.totp_enabled ? 'totp' : user?.auth_methods?.includes('password') ? 'password' : 'magic_link';
}

export function sellerSecuritySatisfied(user: User | null | undefined, missingSteps?: CapabilityStep[]): boolean {
  // The freshest capability response keeps its server readiness guards.
  if (missingSteps) return !missingSteps.includes('totp_enabled');
  return user?.seller_two_factor_satisfied ?? !!user?.totp_enabled;
}
