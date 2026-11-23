'use client';

import {
  Suspense, createContext, useCallback, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { explainSession, type ExplainAction, type ExplainQuestion, type ExplainTarget } from '@/api/explain';
import { authSessionOwner, subscribeAuthSessionOwner } from '@/lib/auth-session-owner';
import { explainCopy } from '@/lib/i18n/explain';
import type { AnonymousAllAILocale } from '@/lib/i18n/anonymous-allai';
import { useAuthStore } from '@/store/auth';

export type ExplainPage = {
  route: string | ((pathname: string) => boolean);
  // Changes when the user changes role, selection, page view or saved versions.
  scope: string;
  targets: Partial<Record<ExplainQuestion, ExplainTarget>>;
  orderChoices?: readonly Extract<ExplainTarget, { kind: 'order' }>[];
  actions?: readonly ExplainAction[];
};

type Registration = {
  id: number;
  path: string;
  location: string;
  owner: number;
  principal: string | null;
  getPage: () => ExplainPage;
};

type ExplainView = {
  registration: Registration;
  launch: { registration: Registration; question?: ExplainQuestion; id: number } | null;
  admit: () => string;
};

const Context = createContext<{
  active: boolean;
  view: ExplainView | null;
  register: (getPage: () => ExplainPage) => (() => void) | undefined;
  locale: AnonymousAllAILocale;
  consume: (id: number) => void;
  start: (question?: ExplainQuestion, returnFocus?: HTMLElement) => void;
  leave: () => void;
} | null>(null);

export const explainFrontendEnabled = () => process.env.NEXT_PUBLIC_STAGE_A_EXPLAIN_ENABLED === 'true';

export function isExplainId(value: string | undefined): value is string {
  return !!value && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
}

function principal(state: ReturnType<typeof useAuthStore.getState>): string | null {
  const session = explainSession(state.token);
  if (!state.isAuthenticated || !session || session.subject !== state.user?.id) return null;
  return JSON.stringify([session.subject, session.organization, session.generation]);
}

function QueryObserver({ onChange }: { onChange: (query: string) => void }) {
  const query = useSearchParams()?.toString() ?? '';
  useLayoutEffect(() => onChange(query), [query, onChange]);
  return null;
}

const browserRoute = () => window.location.pathname + window.location.search;

export function ExplainProvider({ children, pathname, open, locale }: {
  children: ReactNode; pathname: string; open: (returnFocus?: HTMLElement) => void; locale: AnonymousAllAILocale;
}) {
  const owner = useSyncExternalStore(subscribeAuthSessionOwner, authSessionOwner, authSessionOwner);
  const identity = useAuthStore(principal);
  const pending = useRef<Registration | null>(null);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [mode, setMode] = useState<Pick<Registration, 'owner' | 'principal' | 'path'> | null>(null);
  const [launch, setLaunch] = useState<ExplainView['launch']>(null);
  const serial = useRef(0);
  const [query, setQuery] = useState('');
  const register = useCallback((getPage: () => ExplainPage) => {
    const route = getPage().route;
    if (typeof route === 'function' ? !route(pathname) : route !== pathname.replace(/\/$/, '')) return;
    const item = { id: ++serial.current, getPage, path: pathname, location: browserRoute(),
      owner: authSessionOwner(), principal: principal(useAuthStore.getState()) };
    pending.current = item;
    setRegistration(item);
    return () => {
      if (pending.current?.getPage !== getPage) return;
      pending.current = null;
      setRegistration(null);
      setLaunch(last => last?.registration.getPage === getPage ? null : last);
    };
  }, [pathname, query]);

  useLayoutEffect(() => subscribeAuthSessionOwner(change => {
    const previous = pending.current;
    pending.current = null;
    setRegistration(null);
    setLaunch(null);
    const owner = authSessionOwner();
    // A persisted restore retires every old admission. Only the same
    // mounted selection and still-current principal can register again.
    if (change !== 'restored' || !previous?.principal || previous.owner !== owner - 1
      || previous.location !== browserRoute() || previous.principal !== principal(useAuthStore.getState())) {
      setMode(null);
      return;
    }
    const restored = { ...previous, id: ++serial.current, owner };
    pending.current = restored;
    setRegistration(restored);
    setMode(current => current?.owner === previous.owner && current.principal === restored.principal
      && current.path === restored.path ? { owner, principal: restored.principal, path: restored.path } : null);
  }), []);
  useLayoutEffect(() => useAuthStore.subscribe(state => {
    if (!pending.current?.principal || pending.current.principal === principal(state)) return;
    pending.current = null;
    setRegistration(null);
    setLaunch(null);
    setMode(null);
  }), []);

  const registered = identity && registration?.owner === owner && registration.path === pathname
    && registration.principal === identity && registration.location === browserRoute() ? registration : null;
  const active = !!identity && mode?.owner === owner && mode.principal === identity && mode.path === pathname;

  const start = (question?: ExplainQuestion, returnFocus?: HTMLElement) => {
    if (!registered || pending.current !== registered) return;
    setMode({ owner, principal: identity, path: pathname });
    setLaunch({ registration: registered, question, id: ++serial.current });
    open(returnFocus);
  };
  const leave = useCallback(() => { setMode(null); setLaunch(null); }, []);
  const consume = (id: number) => setLaunch(current => current?.id === id ? { ...current, question: undefined } : current);
  const view = registered ? {
    registration: registered,
    launch: active && launch?.registration === registered ? launch : null,
    admit: () => {
      const state = useAuthStore.getState();
      if (pending.current !== registered || registered.location !== browserRoute() || authSessionOwner() !== registered.owner
        || principal(state) !== registered.principal || !state.token) throw new Error('Explain context changed');
      return state.token;
    },
  } : null;

  return <Context.Provider value={{ active, view, register, start, leave, locale, consume }}>
    <Suspense><QueryObserver onChange={setQuery} /></Suspense>
    {children}
  </Context.Provider>;
}

export const useExplain = () => useContext(Context);

export function useExplainPage(page: ExplainPage | null) {
  const register = useContext(Context)?.register;
  const ref = useRef(page);
  const key = register && page && (Object.keys(page.targets).length || page.orderChoices?.length)
    ? JSON.stringify([page.scope, page.targets, page.orderChoices])
    : null;
  useLayoutEffect(() => { ref.current = page; });
  useLayoutEffect(() => {
    if (!register || !key) return;
    return register(() => ref.current!);
  }, [register, key]);
}

export function ExplainEntry({ question }: { question: ExplainQuestion }) {
  const explain = useExplain();
  if (!explain?.view || !(explain.view.registration.getPage().targets[question]
    || (question === 'order_status' && explain.view.registration.getPage().orderChoices?.length))) return null;
  const copy = explainCopy(explain.locale);
  return <button type="button" className="min-h-11 rounded px-2 text-sm font-medium text-indigo-700 underline focus-visible:ring-2 focus-visible:ring-indigo-600"
    onClick={event => explain.start(question, event.currentTarget)}>{copy.question(question)}</button>;
}

export function explainControl(action: ExplainAction): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-explain-control~="${action}"]`))
    .find(control => {
      if (control.matches(':disabled') || control.closest('[hidden], [inert], [aria-disabled="true"]')
        || getComputedStyle(control).visibility !== 'visible') return false;
      for (let node: HTMLElement | null = control; node; node = node.parentElement) {
        if (getComputedStyle(node).display === 'none') return false;
      }
      return true;
    }) ?? null;
}
