import { createContext } from 'react';

const PANEL_STEPS = {
  WorkspaceData: 'data',
  SavedWorkspaceData: 'data',
  SavedLicenseStep: 'license',
  SellerListingEditor: 'listing',
  SavedListingEditor: 'listing',
} as const;
export type WorkspaceCrashPanel = keyof typeof PANEL_STEPS;
export type SellerWorkspaceCrashProof = () => { token: string; draft?: { uuid: string } } | null;

// Panels receive the dashboard's current capability proof in their own tree.
export const SellerWorkspaceCrashAccess = createContext<SellerWorkspaceCrashProof | null>(null);

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
let reportsStarted = 0;

export function isCanonicalDraftUuid(value: unknown): value is string {
  return typeof value === 'string' && value.length === 36 &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
}

export function isSellerWorkspacePath(pathname: string | null): boolean {
  return pathname === WORKSPACE_PATH && typeof window !== 'undefined' && window.location.pathname === WORKSPACE_PATH;
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

export async function reportSellerWorkspaceCrash(
  panel: WorkspaceCrashPanel | 'root',
  error: unknown,
  getProof: SellerWorkspaceCrashProof | null,
): Promise<void> {
  try {
    const build_revision = process.env.FRONTEND_BUILD_REVISION;
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL;
    if (!isSellerWorkspacePath(WORKSPACE_PATH) || reportsStarted >= PAGE_REPORT_LIMIT
      || (apiOrigin !== API_ORIGIN && apiOrigin !== `${API_ORIGIN}/`)
      || build_revision?.length !== 40 || !/^[a-f0-9]{40}$/.test(build_revision)) return;

    const proof = getProof?.();
    if (!proof?.token) return;

    if (panel !== 'root' && !Object.hasOwn(PANEL_STEPS, panel)) return;
    const fields = {
      schema_version: 1,
      route: 'seller_workspace',
      step: panel === 'root' ? 'root' : PANEL_STEPS[panel],
      ...classifyError(error),
      // The legacy v1 field groups by the configured catching panel.
      // It conveys no throwing frame or runtime stack location.
      component_frames: panel === 'root' ? [] : ['WorkspacePanel', panel],
      build_revision,
      ...browserDetails(),
    };

    // Let the fallback commit and recheck route and session before dispatch.
    await Promise.resolve();
    if (!isSellerWorkspacePath(WORKSPACE_PATH) || reportsStarted >= PAGE_REPORT_LIMIT) return;
    const current = getProof?.();
    if (current?.token !== proof.token) return;
    // A pointer proven only before or only after the fallback commit is omitted.
    const draftUuid = proof.draft === current.draft ? proof.draft?.uuid : undefined;
    const body = JSON.stringify({ ...fields, ...(isCanonicalDraftUuid(draftUuid) ? { draft_uuid: draftUuid } : {}) });

    reportsStarted++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      await fetch(CRASH_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${proof.token}`, 'Content-Type': 'application/json' },
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
