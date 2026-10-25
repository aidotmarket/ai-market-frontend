'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getTermsAcceptanceStatus, type TermsAcceptanceContext, type TermsPartyContext } from '@/api/legal';
import { useToast } from '@/components/Toast';
import { useAuthStore } from '@/store/auth';
import TermsAcceptanceForm, { type TermsAcceptancePrefill } from '@/components/legal/TermsAcceptanceForm';
import { getTermsPartyContext, isTermsGateEnforced } from '@/components/legal/termsContext';

type PendingAction = () => unknown | Promise<unknown>;

export function useTermsGate(acceptanceContext: TermsAcceptanceContext = 'buyer', options: { preloadAcceptance?: boolean; requireAcceptance?: boolean; actionContextKey?: string } = {}) {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [promptContext, setPromptContext] = useState<TermsPartyContext | null>(null);
  const [promptPrefill, setPromptPrefill] = useState<TermsAcceptancePrefill | undefined>();
  const [hardGateOpen, setHardGateOpen] = useState(false);
  const [checkingTerms, setCheckingTerms] = useState(false);
  const visitRef = useRef<{ checking: boolean; pendingAction: PendingAction | null } | null>(null);
  const [promptVisit, setPromptVisit] = useState<typeof visitRef.current>(null);
  const context = getTermsPartyContext(user);
  const contextKey = context ? JSON.stringify(context) : null;
  const [acceptedContextKey, setAcceptedContextKey] = useState<string | null>(null);
  const termsAccepted = contextKey !== null && acceptedContextKey === contextKey;
  const { preloadAcceptance = false, requireAcceptance = false, actionContextKey } = options;

  useLayoutEffect(() => {
    visitRef.current = { checking: false, pendingAction: null };
    setCheckingTerms(false);
    setPromptContext(null);
    setPromptPrefill(undefined);
    setHardGateOpen(false);
    setPromptVisit(null);
    setAcceptedContextKey(null);
    return () => { visitRef.current = null; };
  }, [contextKey, acceptanceContext, actionContextKey]);

  useEffect(() => {
    if (!preloadAcceptance || !contextKey) return;
    const visit = visitRef.current;
    let cancelled = false;
    getTermsAcceptanceStatus(JSON.parse(contextKey) as TermsPartyContext).then((status) => {
      if (!cancelled && visitRef.current === visit && status.accepted) setAcceptedContextKey(contextKey);
    }).catch(() => { /* Click-time verification can retry. */ });
    return () => { cancelled = true; };
  }, [contextKey, preloadAcceptance, acceptanceContext, actionContextKey]);

  const ensureTermsAccepted = useCallback(async <T,>(action: () => T | Promise<T>, prefill?: TermsAcceptancePrefill): Promise<T | undefined> => {
    const visit = visitRef.current;
    const isCurrent = () => visit !== null && visitRef.current === visit;
    if (!visit || visit.checking || visit.pendingAction) return;
    if (preloadAcceptance && termsAccepted) return action();
    const context = getTermsPartyContext(user);
    if (!context) {
      if (requireAcceptance) return;
      return action();
    }

    visit.checking = true;
    setCheckingTerms(true);
    let accepted = false;
    try {
      const status = await getTermsAcceptanceStatus(context);
      accepted = status.accepted;
    } catch {
      if (!isCurrent()) return;
      if (requireAcceptance || isTermsGateEnforced()) {
        toast('Could not verify terms acceptance. Please try again.', 'error');
        return;
      }
      toast('Please review and accept the ai.market Terms and Conditions.', 'info');
      return await action();
    } finally {
      if (isCurrent()) {
        visit.checking = false;
        setCheckingTerms(false);
      }
    }

    if (!isCurrent()) return;

    if (accepted) {
      setAcceptedContextKey(contextKey);
      return await action();
    }

    setPromptVisit(visit);
    setPromptContext(context);
    setPromptPrefill(prefill);
    if (requireAcceptance || isTermsGateEnforced()) {
      visit.pendingAction = action;
      setHardGateOpen(true);
      return;
    }

    toast('Please review and accept the ai.market Terms and Conditions.', 'info');
    return await action();
  }, [contextKey, preloadAcceptance, requireAcceptance, termsAccepted, toast, user, actionContextKey, acceptanceContext]);

  const TermsGatePrompt = useCallback(() => {
    if (!promptContext || !promptVisit || visitRef.current !== promptVisit) return null;

    if (hardGateOpen) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Accept Terms and Conditions</h2>
                <p className="mt-1 text-sm text-gray-600">Accept the terms to continue this action.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (visitRef.current !== promptVisit) return;
                  setHardGateOpen(false);
                  if (requireAcceptance) setPromptContext(null);
                  promptVisit.pendingAction = null;
                }}
                className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <TermsAcceptanceForm
              context={promptContext}
              acceptanceContext={acceptanceContext}
              prefill={promptPrefill}
              compact
              onAccepted={async () => {
                if (visitRef.current !== promptVisit) return;
                setAcceptedContextKey(JSON.stringify(promptContext));
                setHardGateOpen(false);
                setPromptContext(null);
                const action = promptVisit.pendingAction;
                promptVisit.pendingAction = null;
                await action?.();
              }}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="mb-4 rounded-lg border border-[#C5CAE9] bg-[#E8EAF6] px-4 py-3 text-sm text-[#303F9F]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Please review and accept the ai.market Terms and Conditions. You can continue for now.
          </p>
          <div className="flex shrink-0 items-center gap-3">
            <Link href={acceptanceContext === 'seller' ? '/legal/terms/accept?context=seller' : '/legal/terms/accept'} className="font-semibold underline underline-offset-2">
              Review and accept
            </Link>
            <button
              type="button"
              onClick={() => { if (visitRef.current === promptVisit) setPromptContext(null); }}
              className="rounded-md px-2 py-1 text-[#303F9F] hover:bg-white/60"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }, [acceptanceContext, hardGateOpen, promptContext, promptPrefill, promptVisit, requireAcceptance]);

  return { ensureTermsAccepted, TermsGatePrompt, checkingTerms, termsAccepted };
}
