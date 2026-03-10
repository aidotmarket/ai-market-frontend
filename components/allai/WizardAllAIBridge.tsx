'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';

export interface FieldProposal {
  field: string;
  proposedValue: string;
  reasoning: string;
  timestamp: number;
  status: 'pending' | 'accepted' | 'rejected' | 'edited';
}

export interface WizardAllAIBridgeValue {
  // Read form state
  getFieldValue: (field: string) => string | null;
  getFormSnapshot: () => Record<string, any>;

  // Propose changes (called by SSE parser when field_proposal arrives)
  proposeFieldChange: (field: string, value: string, reasoning: string) => void;
  proposeBatchChanges: (proposals: { field: string; value: string; reasoning: string }[]) => void;

  // Consent actions (called by FieldProposalCard buttons)
  acceptProposal: (field: string) => void;
  editProposal: (field: string, editedValue: string) => void;
  rejectProposal: (field: string) => void;
  revertAllAIChanges: () => void;

  // State
  pendingProposals: Map<string, FieldProposal>;
  aiPopulatedFields: Set<string>;
  preAIValues: Map<string, string>;

  // Form state setter (wizard page provides this)
  registerFormState: (
    getter: () => Record<string, any>,
    setter: (field: string, value: any) => void,
  ) => void;
}

const WizardAllAIBridgeContext = createContext<WizardAllAIBridgeValue | null>(null);

export function useWizardBridge() {
  return useContext(WizardAllAIBridgeContext);
}

export function useWizardBridgeRequired() {
  const ctx = useContext(WizardAllAIBridgeContext);
  if (!ctx) throw new Error('useWizardBridgeRequired must be used within WizardAllAIBridgeProvider');
  return ctx;
}

export function WizardAllAIBridgeProvider({ children }: { children: ReactNode }) {
  const [pendingProposals, setPendingProposals] = useState<Map<string, FieldProposal>>(new Map());
  const [aiPopulatedFields, setAiPopulatedFields] = useState<Set<string>>(new Set());
  const [preAIValues, setPreAIValues] = useState<Map<string, string>>(new Map());

  const formGetterRef = useRef<(() => Record<string, any>) | null>(null);
  const formSetterRef = useRef<((field: string, value: any) => void) | null>(null);

  const registerFormState = useCallback(
    (getter: () => Record<string, any>, setter: (field: string, value: any) => void) => {
      formGetterRef.current = getter;
      formSetterRef.current = setter;
    },
    [],
  );

  const getFieldValue = useCallback((field: string): string | null => {
    const snapshot = formGetterRef.current?.();
    if (!snapshot) return null;
    const val = snapshot[field];
    return val != null ? String(val) : null;
  }, []);

  const getFormSnapshot = useCallback((): Record<string, any> => {
    return formGetterRef.current?.() ?? {};
  }, []);

  const proposeFieldChange = useCallback(
    (field: string, value: string, reasoning: string) => {
      setPendingProposals((prev) => {
        const next = new Map(prev);
        next.set(field, {
          field,
          proposedValue: value,
          reasoning,
          timestamp: Date.now(),
          status: 'pending',
        });
        return next;
      });
    },
    [],
  );

  const proposeBatchChanges = useCallback(
    (proposals: { field: string; value: string; reasoning: string }[]) => {
      setPendingProposals((prev) => {
        const next = new Map(prev);
        for (const p of proposals) {
          next.set(p.field, {
            field: p.field,
            proposedValue: p.value,
            reasoning: p.reasoning,
            timestamp: Date.now(),
            status: 'pending',
          });
        }
        return next;
      });
    },
    [],
  );

  const acceptProposal = useCallback(
    (field: string) => {
      setPendingProposals((prev) => {
        const proposal = prev.get(field);
        if (!proposal || proposal.status !== 'pending') return prev;

        // Save pre-AI value before overwriting
        const currentValue = formGetterRef.current?.()?.[field];
        setPreAIValues((pv) => {
          const next = new Map(pv);
          if (!next.has(field)) {
            next.set(field, currentValue != null ? String(currentValue) : '');
          }
          return next;
        });

        // Apply value to form
        formSetterRef.current?.(field, proposal.proposedValue);

        // Track AI-populated field
        setAiPopulatedFields((s) => new Set(s).add(field));

        // Update proposal status
        const next = new Map(prev);
        next.set(field, { ...proposal, status: 'accepted' });
        return next;
      });
    },
    [],
  );

  const editProposal = useCallback(
    (field: string, editedValue: string) => {
      setPendingProposals((prev) => {
        const proposal = prev.get(field);
        if (!proposal) return prev;

        // Save pre-AI value before overwriting
        const currentValue = formGetterRef.current?.()?.[field];
        setPreAIValues((pv) => {
          const next = new Map(pv);
          if (!next.has(field)) {
            next.set(field, currentValue != null ? String(currentValue) : '');
          }
          return next;
        });

        // Apply edited value to form
        formSetterRef.current?.(field, editedValue);

        // Track AI-populated field
        setAiPopulatedFields((s) => new Set(s).add(field));

        // Update proposal status
        const next = new Map(prev);
        next.set(field, { ...proposal, proposedValue: editedValue, status: 'edited' });
        return next;
      });
    },
    [],
  );

  const rejectProposal = useCallback((field: string) => {
    setPendingProposals((prev) => {
      const proposal = prev.get(field);
      if (!proposal) return prev;
      const next = new Map(prev);
      next.set(field, { ...proposal, status: 'rejected' });
      return next;
    });
  }, []);

  const revertAllAIChanges = useCallback(() => {
    // Restore all pre-AI values
    preAIValues.forEach((originalValue, field) => {
      formSetterRef.current?.(field, originalValue);
    });
    setPreAIValues(new Map());
    setAiPopulatedFields(new Set());
    setPendingProposals(new Map());
  }, [preAIValues]);

  const value: WizardAllAIBridgeValue = {
    getFieldValue,
    getFormSnapshot,
    proposeFieldChange,
    proposeBatchChanges,
    acceptProposal,
    editProposal,
    rejectProposal,
    revertAllAIChanges,
    pendingProposals,
    aiPopulatedFields,
    preAIValues,
    registerFormState,
  };

  return (
    <WizardAllAIBridgeContext.Provider value={value}>
      {children}
    </WizardAllAIBridgeContext.Provider>
  );
}
