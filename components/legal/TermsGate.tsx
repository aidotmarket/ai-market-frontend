'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { getTermsAcceptanceStatus, type TermsPartyContext } from '@/api/legal';
import { useToast } from '@/components/Toast';
import { useAuthStore } from '@/store/auth';
import TermsAcceptanceForm from '@/components/legal/TermsAcceptanceForm';
import { getTermsPartyContext, isTermsGateEnforced } from '@/components/legal/termsContext';

type PendingAction = () => unknown | Promise<unknown>;

export function useTermsGate() {
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const [promptContext, setPromptContext] = useState<TermsPartyContext | null>(null);
  const [hardGateOpen, setHardGateOpen] = useState(false);
  const [checkingTerms, setCheckingTerms] = useState(false);
  const pendingActionRef = useRef<PendingAction | null>(null);

  const ensureTermsAccepted = useCallback(async <T,>(action: () => T | Promise<T>): Promise<T | undefined> => {
    const context = getTermsPartyContext(user);
    if (!context) {
      return action();
    }

    setCheckingTerms(true);
    let accepted = false;
    try {
      const status = await getTermsAcceptanceStatus(context);
      accepted = status.accepted;
    } catch {
      if (isTermsGateEnforced()) {
        toast('Could not verify terms acceptance. Please try again.', 'error');
        return;
      }
      toast('Please review and accept the ai.market Terms and Conditions.', 'info');
      return await action();
    } finally {
      setCheckingTerms(false);
    }

    if (accepted) {
      return await action();
    }

    setPromptContext(context);
    if (isTermsGateEnforced()) {
      pendingActionRef.current = action;
      setHardGateOpen(true);
      return;
    }

    toast('Please review and accept the ai.market Terms and Conditions.', 'info');
    return await action();
  }, [toast, user]);

  const TermsGatePrompt = useCallback(() => {
    if (!promptContext) return null;

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
                  setHardGateOpen(false);
                  pendingActionRef.current = null;
                }}
                className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <TermsAcceptanceForm
              context={promptContext}
              compact
              onAccepted={async () => {
                setHardGateOpen(false);
                setPromptContext(null);
                const action = pendingActionRef.current;
                pendingActionRef.current = null;
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
            <Link href="/legal/terms/accept" className="font-semibold underline underline-offset-2">
              Review and accept
            </Link>
            <button
              type="button"
              onClick={() => setPromptContext(null)}
              className="rounded-md px-2 py-1 text-[#303F9F] hover:bg-white/60"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }, [hardGateOpen, promptContext]);

  return { ensureTermsAccepted, TermsGatePrompt, checkingTerms };
}
