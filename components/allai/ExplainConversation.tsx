'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { appendExplain, explainActions, type ExplainAction, type ExplainAnswer, type ExplainQuestion } from '@/api/explain';
import { useAuthStore } from '@/store/auth';
import { subscribeAuthSessionOwner } from '@/lib/auth-session-owner';
import { explainCopy, explainQuestions, matchExplainQuestion } from '@/lib/i18n/explain';
import type { AnonymousAllAILocale } from '@/lib/i18n/anonymous-allai';
import { explainControl, useExplain } from './ExplainContext';

const buttonClass = 'min-h-11 rounded-md border border-white/20 px-2 text-start text-sm text-white focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50';

type Close = (getFocusTarget?: () => HTMLElement | null) => void;

export default function ExplainConversation({ locale, close }: { locale: AnonymousAllAILocale; close: Close }) {
  const explain = useExplain();
  const view = explain?.view;
  if (!view) return <p role="status" lang={locale} className="px-4 py-3 text-sm text-white">{explainCopy(locale).unavailable}</p>;
  const { registration, launch } = view;
  return <Conversation key={registration.id}
    view={view} launchId={launch?.id} consume={explain.consume} locale={locale} close={close} />;
}

type View = NonNullable<NonNullable<ReturnType<typeof useExplain>>['view']>;

function Conversation({ view, launchId, consume, locale, close }: {
  view: View; launchId?: number; consume: (id: number) => void; locale: AnonymousAllAILocale; close: Close;
}) {
  const [value, setValue] = useState('');
  const [turns, setTurns] = useState<ExplainAnswer[]>([]);
  const [notice, setNotice] = useState<'suggestions' | 'selectContext' | 'unavailable' | 'possibleMatch' | 'noMatch' | 'uncertain'>();
  const [busy, setBusy] = useState(false);
  const [chooseRole, setChooseRole] = useState(false);
  const [availableAction, setAvailableAction] = useState<ExplainAction | null>(null);
  const [turnsToken, setTurnsToken] = useState<string | null>(null);
  const [noticeToken, setNoticeToken] = useState<string | null>(null);
  const token = useAuthStore(state => state.token);
  const flight = useRef<AbortController | null>(null);
  const thread = useRef<{ id: string; expires: number } | null>(null);
  const lastRole = useRef<'buyer' | 'seller' | null>(null);
  const started = useRef<number | undefined>(undefined);
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const copy = explainCopy(locale);
  const page = view.registration.getPage();
  const visibleTurns = turnsToken === token ? turns : [];
  const visibleNotice = noticeToken === token ? notice : undefined;
  const showRoleChoices = noticeToken === token && chooseRole;

  useLayoutEffect(() => {
    const abort = () => { flight.current?.abort(); thread.current = null; };
    const unsubscribe = subscribeAuthSessionOwner(abort);
    const unsubscribeAuth = useAuthStore.subscribe(() => {
      try { view.admit(); } catch { abort(); }
    });
    const hide = () => {
      abort();
      flushSync(() => { setTurns([]); setNotice(undefined); setValue(''); setBusy(false); setChooseRole(false); });
    };
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      unsubscribeAuth();
      unsubscribe();
      abort();
    };
  }, []);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [turns, notice]);
  useEffect(() => {
    const expiry = thread.current?.expires;
    if (!expiry) return;
    const expire = () => { thread.current = null; setTurns([]); };
    const remaining = expiry - Date.now();
    if (remaining <= 0) { expire(); return; }
    // The maximum timeout is shorter than the server's 30-day retention.
    const timer = window.setInterval(() => { if (Date.now() >= expiry) expire(); }, Math.min(remaining, 60_000));
    return () => window.clearInterval(timer);
  }, [turns]);

  async function ask(question: ExplainQuestion, target = page.targets[question]) {
    if (flight.current) return;
    setNotice(undefined);
    if (!target) {
      try { setNoticeToken(view.admit()); } catch { return; }
      setChooseRole(question === 'order_status' && !!page.orderChoices?.length);
      setNotice('selectContext');
      return;
    }
    setChooseRole(false);
    if (target.kind === 'order' && lastRole.current !== target.role) {
      lastRole.current = target.role;
      thread.current = null;
      setTurns([]);
    }
    const url = window.location.pathname + window.location.search;
    const controller = new AbortController();
    flight.current = controller;
    const currentToken = () => {
      controller.signal.throwIfAborted();
      if (url !== window.location.pathname + window.location.search) throw new Error('Explain route changed');
      return view.admit();
    };
    setBusy(true);
    try {
      if (thread.current && thread.current.expires <= Date.now()) {
        thread.current = null;
        setTurns([]);
      }
      const apply = await appendExplain({ owner: view.registration.owner, signal: controller.signal, currentToken }, {
        intent: 'explain', question, locale, target, ...(thread.current && { conversation_id: thread.current.id }),
      });
      await apply(reply => flushSync(() => {
        const credential = currentToken();
        setNoticeToken(credential);
        if (reply.kind === 'answer') {
          setTurnsToken(credential);
          thread.current = { id: reply.answer.conversation_id, expires: Date.parse(reply.answer.expires_at) };
          setTurns(previous => [...previous, reply.answer]);
        } else if (reply.kind === 'uncertain') {
          if (reply.history === 'unverified') { thread.current = null; setTurns([]); }
          else setTurnsToken(credential);
          setNotice(reply.history === 'unverified' ? 'uncertain' : reply.history);
        } else if (reply.kind === 'select_context') {
          setChooseRole(question === 'order_status' && !!page.orderChoices?.length);
          setNotice('selectContext');
        } else if (reply.kind === 'suggestions') {
          setNotice('suggestions');
        } else if (reply.kind === 'refused') {
          if (reply.clear) { thread.current = null; setTurns([]); }
          setNotice('unavailable');
        }
        setBusy(false);
      }));
    } catch {
      try {
        setNoticeToken(currentToken());
        setNotice('unavailable');
        setBusy(false);
      } catch { /* The invalidated view cannot publish its result. */ }
    } finally {
      if (flight.current === controller) flight.current = null;
    }
  }

  useEffect(() => {
    if (launchId === undefined || started.current === launchId) return;
    started.current = launchId;
    input.current?.focus();
    if (view.launch?.question) {
      consume(launchId);
      void ask(view.launch.question);
    }
  });
  useLayoutEffect(() => { input.current?.focus(); }, []);

  function submit() {
    if (busy || !value.trim()) return;
    const matched = matchExplainQuestion(value, locale);
    setValue('');
    if (matched) void ask(matched);
    else {
      try { setNoticeToken(view.admit()); } catch { return; }
      setChooseRole(false);
      setNotice('suggestions');
    }
  }

  const relevant = explainQuestions.filter(question => page.targets[question]
    || (question === 'order_status' && page.orderChoices?.length));
  const latest = visibleTurns.at(-1);
  const candidate = latest?.facts.next_action;
  const action = !notice && !busy && candidate && page.actions?.includes(candidate)
    && (candidate !== 'publish' || latest.facts.availability === 'known')
    && (explainActions[latest.turn.question] as readonly string[]).includes(candidate) ? candidate : null;
  const getPage = view.registration.getPage;

  useLayoutEffect(() => {
    if (!action) {
      setAvailableAction(null);
      return;
    }
    const check = () => setAvailableAction(getPage().actions?.includes(action) && explainControl(action) ? action : null);
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['disabled', 'hidden', 'inert', 'aria-disabled', 'class', 'style', 'data-explain-control'],
    });
    window.addEventListener('resize', check);
    return () => { observer.disconnect(); window.removeEventListener('resize', check); };
  }, [action, getPage]);

  return <section lang={locale} aria-label={copy.title} className="flex min-h-0 flex-1 flex-col text-white">
    <div ref={log} role="log" aria-label={copy.title} aria-live="polite"
      className="min-h-0 flex-1 space-y-3 overflow-y-auto break-words px-4 py-3">
      {visibleTurns.map(({ turn }) => <article key={turn.id} lang={turn.locale}>
        <p className="text-sm font-semibold">{turn.label}</p>
        <p className="mt-1 text-sm text-white/90">{turn.answer}</p>
      </article>)}
      {busy && <p role="status" className="text-sm">{copy.busy}</p>}
      {visibleNotice && <p className="text-sm">{copy[visibleNotice]}</p>}
      {showRoleChoices && <div className="flex flex-wrap gap-2">
        {page.orderChoices?.map(target => <button className={buttonClass} type="button" key={target.role}
          onClick={() => void ask('order_status', target)}>{copy[target.role]}</button>)}
      </div>}
      {(!visibleTurns.length || visibleNotice === 'suggestions' || visibleNotice === 'selectContext') && !busy && !showRoleChoices && <div className="flex flex-wrap gap-2">
        {(visibleNotice === 'suggestions' ? explainQuestions : relevant).map(question => <button type="button" key={question}
          className={buttonClass} onClick={() => void ask(question)}>{copy.question(question)}</button>)}
      </div>}
      {action && availableAction === action && <button type="button" className={buttonClass} onClick={() => {
        try { view.admit(); } catch { return; }
        const control = getPage().actions?.includes(action) && explainControl(action);
        if (!control) return;
        close(() => {
          try { view.admit(); } catch { return null; }
          return getPage().actions?.includes(action) && explainControl(action) === control ? control : null;
        });
      }}>{copy.action(action)}</button>}
    </div>
    <form className="flex shrink-0 items-end gap-2 px-4 pb-4" onSubmit={event => { event.preventDefault(); submit(); }}>
      <textarea ref={input} data-allai-autofocus="true" rows={2} maxLength={256} aria-label={copy.input}
        placeholder={copy.input} value={value} onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          event.preventDefault();
          submit();
        }}
        className="min-w-0 flex-1 resize-none rounded-md border border-white/30 bg-transparent px-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-blue-300" />
      <button type="submit" className={buttonClass} disabled={busy || !value.trim()}>{copy.send}</button>
    </form>
  </section>;
}
