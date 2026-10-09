import { getMe } from '@/api/auth';
import { useAuthStore } from '@/store/auth';

declare global {
  interface Window { aimCompanySignInPopup?: Window }
}

// A returned popup must not rotate the refresh cookie while its original
// window restores the session. This marker holds only a window reference.
export function isCompanySignInReturnPopup(): boolean {
  if (!companySignInEnabled()) return false;
  try {
    return !!window.opener && window.opener.aimCompanySignInPopup === window
      && companyReturnAllowed(window.location.pathname) && !window.location.search && !window.location.hash;
  } catch { return false; }
}

export const companySignInEnabled = () => process.env.NEXT_PUBLIC_ORG_SSO_WEB_RETURN_ENABLED === 'true';
export const COMPANY_RETURN = /^\/confirm\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/;
export const companyReturnAllowed = (path: string) => path === '/dashboard/settings' || COMPANY_RETURN.test(path);
export const COMPANY_SIGN_IN_ERROR = 'Company sign-in did not finish or expired. Try again.';

// Keep the original page (including any pending-action link credential) in
// memory. The backend owns state, nonce, freshness and the HttpOnly cookies.
export async function startCompanySignIn(orgSlug: string, returnPath: string): Promise<void> {
  if (!companySignInEnabled() || !companyReturnAllowed(returnPath) || !orgSlug.trim()) throw new Error(COMPANY_SIGN_IN_ERROR);
  const owner = useAuthStore.getState().user?.id;
  const url = new URL('/api/v1/auth/sso/oidc/authorize', process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
  url.searchParams.set('org_slug', orgSlug.trim());
  url.searchParams.set('return_path', returnPath);
  const name = `company-sign-in-${crypto.randomUUID()}`;
  const popup = window.open('', name, 'popup,width=520,height=720');
  if (!popup) throw new Error('Allow popups to sign in through your company.');
  window.aimCompanySignInPopup = popup;
  // Confirmation pages use no-referrer. Send only our origin for the
  // backend's exact website admission check, never the original link query.
  const link = document.createElement('a');
  link.href = url.href; link.target = name; link.referrerPolicy = 'origin';
  link.click();
  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 600_000;
    const finish = (ok: boolean) => {
      window.clearInterval(timer);
      if (window.aimCompanySignInPopup === popup) delete window.aimCompanySignInPopup;
      if (!popup.closed) popup.close();
      if (ok) resolve(); else reject(new Error(COMPANY_SIGN_IN_ERROR));
    };
    const timer = window.setInterval(() => {
      if (popup.closed || Date.now() >= deadline || useAuthStore.getState().user?.id !== owner) { finish(false); return; }
      try {
        const returned = new URL(popup.location.href);
        if (returned.origin === window.location.origin && !returned.pathname.startsWith('/api/')) {
          finish(returned.pathname === returnPath && returned.search === '' && returned.hash === '');
        }
      } catch { /* Cross-origin IdP/backend pages stay in the popup. */ }
    }, 300);
  });
  await useAuthStore.getState().refreshAuth();
  const user = await getMe();
  if (!owner || user.id !== owner || !user.sso_enforced || user.two_factor_provider) throw new Error(COMPANY_SIGN_IN_ERROR);
  useAuthStore.setState({ user });
}
