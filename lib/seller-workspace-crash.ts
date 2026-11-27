import { authSessionOwner, isAuthSessionOwner } from '@/lib/auth-session-owner';
import { useAuthStore } from '@/store/auth';

export type WorkspacePanelCrashStep = 'data' | 'license' | 'listing';

const WORKSPACE_PATH = '/dashboard/seller-workspace';
const API_ORIGIN = 'https://api.ai.market';
const CRASH_ENDPOINT = `${API_ORIGIN}/api/v1/seller-workspace/client-crash`;
const REQUEST_TIMEOUT_MS = 1500;
const PAGE_REPORT_LIMIT = 3;
const ERROR_NAMES = ['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'ChunkLoadError'] as const;
const ERROR_PATTERNS = [
  ['TypeError', 'missing_property', /^(?:Cannot read propert(?:y|ies) of (?:undefined|null)\b|undefined is not an object\b|null is not an object\b)/],
  ['TypeError', 'not_callable', /^[^\r\n]+ is not a function\b/],
  ['ReferenceError', 'not_defined', /^(?:Can't find variable: |[^\r\n]+ is not defined\b)/],
] as const;
const COMPONENT_FRAMES = [
  'WorkspacePanel', 'WorkspaceOverview', 'WorkspaceData', 'ObjectBrowser', 'SavedWorkspaceData',
  'SavedLicenseStep', 'SellerLicenseSelection', 'SavedListingEditor', 'SellerListingEditor',
  'GuidedListingFlow', 'SellerWorkspacePage',
] as const;
let reportsStarted = 0;

export function isSellerWorkspacePath(pathname: string | null): boolean {
  return pathname === WORKSPACE_PATH && typeof window !== 'undefined' && window.location.pathname === WORKSPACE_PATH;
}

function sellerAccessToken() {
  const { token, user, isAuthenticated, hydrated, isLoading } = useAuthStore.getState();
  return hydrated && !isLoading && isAuthenticated && user?.role === 'seller' && user.status === 'active' ? token : null;
}

function classifyError(error: unknown) {
  const details = typeof error === 'object' && error !== null
    ? error as { name?: unknown; message?: unknown }
    : undefined;
  const error_name = ERROR_NAMES.find(name => name === details?.name) ?? 'Other';
  const message = typeof details?.message === 'string' ? details.message.slice(0, 512) : '';
  const react = /^Minified React error #([1-9]\d{0,2})(?=;|$)/.exec(message);
  const react_code = react ? Number(react[1]) : null;
  const pattern = ERROR_PATTERNS.find(([name, , matches]) => name === error_name && matches.test(message));
  const error_code = react ? 'react_minified'
    : error_name === 'ChunkLoadError' ? 'chunk_load'
    : pattern?.[1] ?? 'unknown';
  return { error_name, error_code, react_code };
}

function componentFrames(stack?: string | null) {
  const frames: (typeof COMPONENT_FRAMES)[number][] = [];
  for (const line of stack?.slice(0, 16_384).split('\n') ?? []) {
    const name = /^\s*at ([A-Za-z]+)(?= \(|$)/.exec(line)?.[1]
      ?? /^([A-Za-z]+)@/.exec(line)?.[1];
    const frame = COMPONENT_FRAMES.find(allowed => allowed === name);
    if (frame && !frames.includes(frame)) frames.push(frame);
    if (frames.length === 8) break;
  }
  return frames;
}

function browserDetails() {
  const agent = window.navigator.userAgent.slice(0, 512);
  const browsers = [
    ['Edge', /\bEdg(?:A|iOS)?\/(\d+)(?=\.|\s|$)/],
    ['Firefox', /\b(?:Firefox|FxiOS)\/(\d+)(?=\.|\s|$)/],
    ['Chrome', /\b(?:Chrome|CriOS)\/(\d+)(?=\.|\s|$)/],
    ['Safari', /\bVersion\/(\d+)(?=\.|\s|$).*\bSafari\//],
  ] as const;
  for (const [browser_family, pattern] of browsers) {
    const major = pattern.exec(agent)?.[1];
    if (major) return { browser_family, browser_major: /^[1-9]\d{0,2}$/.test(major) ? Number(major) : null };
  }
  return { browser_family: 'Other', browser_major: null };
}

export async function reportSellerWorkspaceCrash(step: WorkspacePanelCrashStep | 'root', error: unknown, stack?: string | null): Promise<void> {
  try {
    const build_revision = process.env.FRONTEND_BUILD_REVISION;
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL;
    if (!isSellerWorkspacePath(WORKSPACE_PATH) || reportsStarted >= PAGE_REPORT_LIMIT
      || (apiOrigin !== API_ORIGIN && apiOrigin !== `${API_ORIGIN}/`)
      || build_revision?.length !== 40 || !/^[a-f0-9]{40}$/.test(build_revision)) return;

    const owner = authSessionOwner();
    const token = sellerAccessToken();
    if (!token) return;

    const body = JSON.stringify({
      schema_version: 1,
      route: 'seller_workspace',
      step,
      ...classifyError(error),
      component_frames: componentFrames(stack),
      build_revision,
      ...browserDetails(),
    });

    // Let the fallback commit and recheck route and session before dispatch.
    await Promise.resolve();
    if (!isSellerWorkspacePath(WORKSPACE_PATH) || !isAuthSessionOwner(owner) || sellerAccessToken() !== token
      || reportsStarted >= PAGE_REPORT_LIMIT) return;

    reportsStarted++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      await fetch(CRASH_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  } catch {
    // Reporting must leave the fallback usable even when collection fails.
  }
}
