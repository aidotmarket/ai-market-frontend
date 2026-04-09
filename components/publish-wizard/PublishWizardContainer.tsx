'use client';

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useToast } from '@/components/Toast';
import { useAuthStore } from '@/store/auth';
import {
  getPublishOperation,
  getWizardState,
  runPiiScan,
  saveWizardState,
  transitionPublishOperation,
  type PublishOperationResponse,
  type WizardStateUpdate,
} from '@/lib/api/publish-wizard';
import { OperationStatusBadge } from './OperationStatusBadge';
import { WizardStepper } from './WizardStepper';
import {
  type ProposalCardData,
  type ProposalDecisionState,
  type ProposalDecisionValue,
  type PublishWizardDraft,
  type PublishWizardContextSnapshot,
  type WizardStepKey,
  WIZARD_STEPS,
} from './types';
import { AccountLinkStep } from './steps/AccountLinkStep';
import { TermsStep } from './steps/TermsStep';
import { PrivacyStep } from './steps/PrivacyStep';
import { ComplianceStep } from './steps/ComplianceStep';
import { ProvenanceStep } from './steps/ProvenanceStep';
import { QualityStep } from './steps/QualityStep';
import { MetadataStep } from './steps/MetadataStep';
import { PricePublishStep } from './steps/PricePublishStep';

const DEFAULT_DRAFT: PublishWizardDraft = {
  account: { linked: false, email: '', deviceLabel: '' },
  terms: { accepted: false },
  privacy: { scanCompleted: false, findings: [], notes: '', proposals: [], decisions: {} },
  compliance: { frameworks: [], handlingPII: '', crossBorderTransfers: '', regulatedData: '' },
  provenance: { source: '', collectionMethod: '', collectionDates: '', geoCoverage: '', processingSummary: '', license: '' },
  quality: {
    scores: { completeness: 78, consistency: 81, coverage: 73, freshness: 69, documentation: 84, trust: 76 },
    syntheticPreview: [
      'What quarterly trends can buyers extract from this dataset?',
      'How complete is historical regional coverage?',
    ],
    proposals: [
      { id: 'quality-note', label: 'Quality note', value: 'Add a short data dictionary excerpt to improve buyer confidence.', reasoning: 'Documentation typically lifts conversion when schema complexity is high.' },
    ],
    decisions: {},
  },
  metadata: {
    title: '',
    description: '',
    tags: [],
    category: '',
    proposals: [
      { id: 'title', label: 'Proposed title', value: 'Operational Intelligence Dataset', reasoning: 'Leans into business outcome language instead of raw warehouse terminology.' },
      { id: 'description', label: 'Proposed description', value: 'A structured dataset for analysts and AI systems who need decision-ready operational signals.', reasoning: 'Frames the listing for commercial buyers while keeping scope broad.' },
    ],
    decisions: {},
  },
  price_publish: {
    price: '49',
    allStepsComplete: false,
    confirmationChecked: false,
    checklist: { oneTimeOnly: true, reviewedPrivacy: false, reviewedMetadata: false },
  },
};

const MAX_WIZARD_STEP_INDEX = WIZARD_STEPS.length - 1;

function clampWizardStep(step: number | null | undefined) {
  return Math.max(0, Math.min(MAX_WIZARD_STEP_INDEX, step ?? 0));
}

function toProposalMap(proposals: ProposalCardData[]) {
  return proposals.reduce<Record<string, ProposalCardData>>((acc, proposal) => {
    acc[proposal.id] = proposal;
    return acc;
  }, {});
}

function fromProposalMap(value: unknown): ProposalCardData[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, Record<string, unknown>>).map(([id, entry]) => ({
    id,
    label: String(entry.label ?? id),
    value: String(entry.value ?? ''),
    reasoning: String(entry.reasoning ?? ''),
  }));
}

function fromDecisionMap(value: unknown): Record<string, ProposalDecisionState> {
  if (!value || typeof value !== 'object') return {};
  return Object.entries(value as Record<string, Record<string, unknown>>).reduce<Record<string, ProposalDecisionState>>((acc, [id, entry]) => {
    acc[id] = {
      status: (entry.status as ProposalDecisionValue) ?? 'pending',
      editedValue: typeof entry.editedValue === 'string' ? entry.editedValue : undefined,
    };
    return acc;
  }, {});
}

function buildSavePayload(currentStep: number, draft: PublishWizardDraft): WizardStateUpdate {
  const allPriorStepsComplete = areAllPriorStepsComplete(draft);
  return {
    current_step: currentStep,
    steps: {
      account: {
        step_index: 0,
        step_key: 'account',
        completed: validateStep('account', draft),
        form_data: draft.account as unknown as Record<string, unknown>,
      },
      terms: {
        step_index: 1,
        step_key: 'terms',
        completed: validateStep('terms', draft),
        form_data: draft.terms as unknown as Record<string, unknown>,
      },
      privacy: {
        step_index: 2,
        step_key: 'privacy',
        completed: validateStep('privacy', draft),
        form_data: {
          scanCompleted: draft.privacy.scanCompleted,
          findings: draft.privacy.findings,
          notes: draft.privacy.notes,
        },
        allai_proposals: toProposalMap(draft.privacy.proposals),
        allai_proposal_decisions: draft.privacy.decisions,
      },
      compliance: {
        step_index: 3,
        step_key: 'compliance',
        completed: validateStep('compliance', draft),
        form_data: draft.compliance as unknown as Record<string, unknown>,
      },
      provenance: {
        step_index: 4,
        step_key: 'provenance',
        completed: validateStep('provenance', draft),
        form_data: draft.provenance as unknown as Record<string, unknown>,
      },
      quality: {
        step_index: 5,
        step_key: 'quality',
        completed: validateStep('quality', draft),
        form_data: { scores: draft.quality.scores, syntheticPreview: draft.quality.syntheticPreview },
        allai_proposals: toProposalMap(draft.quality.proposals),
        allai_proposal_decisions: draft.quality.decisions,
      },
      metadata: {
        step_index: 6,
        step_key: 'metadata',
        completed: validateStep('metadata', draft),
        form_data: {
          title: draft.metadata.title,
          description: draft.metadata.description,
          tags: draft.metadata.tags,
          category: draft.metadata.category,
        },
        allai_proposals: toProposalMap(draft.metadata.proposals),
        allai_proposal_decisions: draft.metadata.decisions,
      },
      price_publish: {
        step_index: 7,
        step_key: 'price_publish',
        completed: validateStep('price_publish', draft),
        form_data: {
          ...draft.price_publish,
          allStepsComplete: allPriorStepsComplete,
        } as unknown as Record<string, unknown>,
      },
    },
  };
}

function hydrateDraft(base: PublishWizardDraft, steps: WizardStateUpdate['steps'] | Record<string, { form_data?: Record<string, unknown>; allai_proposals?: unknown; allai_proposal_decisions?: unknown }>): PublishWizardDraft {
  const next = structuredClone(base);

  const privacy = steps.privacy;
  if (privacy?.form_data) {
    next.privacy = {
      scanCompleted: Boolean(privacy.form_data.scanCompleted),
      findings: Array.isArray(privacy.form_data.findings) ? (privacy.form_data.findings as PublishWizardDraft['privacy']['findings']) : [],
      notes: String(privacy.form_data.notes ?? ''),
      proposals: fromProposalMap(privacy.allai_proposals),
      decisions: fromDecisionMap(privacy.allai_proposal_decisions),
    };
  }

  const quality = steps.quality;
  if (quality?.form_data) {
    next.quality = {
      scores: (quality.form_data.scores as Record<string, number>) ?? next.quality.scores,
      syntheticPreview: (quality.form_data.syntheticPreview as string[]) ?? next.quality.syntheticPreview,
      proposals: fromProposalMap(quality.allai_proposals),
      decisions: fromDecisionMap(quality.allai_proposal_decisions),
    };
  }

  const metadata = steps.metadata;
  if (metadata?.form_data) {
    next.metadata = {
      title: String(metadata.form_data.title ?? ''),
      description: String(metadata.form_data.description ?? ''),
      tags: Array.isArray(metadata.form_data.tags) ? (metadata.form_data.tags as string[]) : [],
      category: String(metadata.form_data.category ?? ''),
      proposals: fromProposalMap(metadata.allai_proposals).length > 0 ? fromProposalMap(metadata.allai_proposals) : next.metadata.proposals,
      decisions: fromDecisionMap(metadata.allai_proposal_decisions),
    };
  }

  (['account', 'terms', 'compliance', 'provenance', 'price_publish'] as const).forEach((key) => {
    const step = steps[key];
    if (step?.form_data) {
      Object.assign(next[key], step.form_data);
    }
  });

  return next;
}

function areAllPriorStepsComplete(draft: PublishWizardDraft): boolean {
  return WIZARD_STEPS.slice(0, MAX_WIZARD_STEP_INDEX).every((step) => validateStep(step.key, draft));
}

function validateStep(stepKey: WizardStepKey, draft: PublishWizardDraft): boolean {
  switch (stepKey) {
    case 'account':
      return draft.account.linked && draft.account.email.trim().length > 0 && draft.account.deviceLabel.trim().length > 0;
    case 'terms':
      return draft.terms.accepted;
    case 'privacy': {
      const scanCompleted = draft.privacy.scanCompleted;
      const hasFindings = draft.privacy.proposals.length > 0;
      const allDecisionsRecorded = hasFindings && draft.privacy.proposals.every((proposal) => (draft.privacy.decisions[proposal.id]?.status ?? 'pending') !== 'pending');
      const cleanScan = scanCompleted && draft.privacy.findings.length === 0 && draft.privacy.proposals.length === 0;
      return scanCompleted && (allDecisionsRecorded || cleanScan);
    }
    case 'compliance':
      return draft.compliance.frameworks.length > 0 && !!draft.compliance.handlingPII && !!draft.compliance.crossBorderTransfers && !!draft.compliance.regulatedData;
    case 'provenance':
      return [draft.provenance.source, draft.provenance.collectionMethod, draft.provenance.collectionDates, draft.provenance.geoCoverage, draft.provenance.processingSummary, draft.provenance.license].every((value) => value.trim().length > 0);
    case 'quality':
      return draft.quality.proposals.every((proposal) => (draft.quality.decisions[proposal.id]?.status ?? 'pending') !== 'pending');
    case 'metadata':
      return !!draft.metadata.title.trim() && !!draft.metadata.description.trim() && !!draft.metadata.category.trim() && draft.metadata.proposals.every((proposal) => (draft.metadata.decisions[proposal.id]?.status ?? 'pending') !== 'pending');
    case 'price_publish':
      return Number(draft.price_publish.price) >= 1 && areAllPriorStepsComplete(draft) && draft.price_publish.confirmationChecked;
    default:
      return false;
  }
}

export function PublishWizardContainer({ operationId }: { operationId: string }) {
  return (
    <ProtectedRoute>
      <PublishWizardProtected operationId={operationId} />
    </ProtectedRoute>
  );
}

function PublishWizardProtected({ operationId }: { operationId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  const [operation, setOperation] = useState<PublishOperationResponse | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [draft, setDraft] = useState<PublishWizardDraft>(DEFAULT_DRAFT);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [scanState, setScanState] = useState<'idle' | 'running'>('idle');
  const [publishing, setPublishing] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [operationResponse, wizardStateResponse] = await Promise.all([
          getPublishOperation(operationId),
          getWizardState(operationId),
        ]);

        if (!active) return;

        setOperation(operationResponse);
        setCurrentStep(clampWizardStep(wizardStateResponse.current_step));
        setLastSavedAt(wizardStateResponse.updated_at);
        setDraft((prev) => hydrateDraft(prev, wizardStateResponse.steps));
        hydratedRef.current = true;
      } catch (error) {
        console.error('Failed to load publish wizard', error);
        toast('Failed to load the publish wizard.', 'error');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [operationId, toast]);

  useEffect(() => {
    if (!hydratedRef.current) return;

    const timeout = window.setTimeout(async () => {
      try {
        setSaveState('saving');
        const saved = await saveWizardState(operationId, buildSavePayload(currentStep, draft));
        startTransition(() => {
          setLastSavedAt(saved.updated_at);
          setSaveState('saved');
        });
      } catch (error) {
        console.error('Failed to auto-save wizard state', error);
        setSaveState('error');
      }
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [currentStep, draft, operationId]);

  useEffect(() => {
    const handlePageHide = () => {
      if (!token || !hydratedRef.current) return;
      const body = JSON.stringify({
        token,
        payload: buildSavePayload(currentStep, draft),
      });
      navigator.sendBeacon(
        `/api/publish-wizard/${operationId}/wizard-state`,
        new Blob([body], { type: 'application/json' }),
      );
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [currentStep, draft, operationId, token]);

  const completedSteps = useMemo(() => {
    const result = new Set<number>();
    WIZARD_STEPS.forEach((step, index) => {
      if (validateStep(step.key, draft)) result.add(index);
    });
    return result;
  }, [draft]);

  const status = operation?.status ?? 'draft';
  const context: PublishWizardContextSnapshot = {
    operationId,
    status,
    currentStep,
    lastSavedAt,
  };

  const isStepUnlocked = (index: number) =>
    index === 0 || WIZARD_STEPS.slice(0, index).every((step) => validateStep(step.key, draft));

  const navigateToStep = (index: number) => {
    if (!isStepUnlocked(index)) {
      toast('Finish the previous required steps first.', 'info');
      return;
    }
    setCurrentStep(index);
  };

  const goNext = () => {
    const key = WIZARD_STEPS[currentStep].key;
    if (!validateStep(key, draft)) {
      toast('This step still needs explicit review before you can continue.', 'info');
      return;
    }
    setCurrentStep((value) => Math.min(value + 1, WIZARD_STEPS.length - 1));
  };

  const goBack = () => setCurrentStep((value) => Math.max(value - 1, 0));

  const updateProposalDecision = (stepKey: 'privacy' | 'quality' | 'metadata', proposalId: string, statusValue: ProposalDecisionValue, editedValue?: string) => {
    setDraft((prev) => ({
      ...prev,
      [stepKey]: {
        ...prev[stepKey],
        decisions: {
          ...prev[stepKey].decisions,
          [proposalId]: { status: statusValue, editedValue },
        },
      },
    }));
  };

  const handleRunPiiScan = async () => {
    setScanState('running');
    try {
      const scan = await runPiiScan(operationId);
      const proposals = scan.findings.map((finding) => ({
        id: `${finding.column_name}-${finding.pii_type}`,
        label: `${finding.column_name} remediation`,
        value: `Remove or redact ${finding.column_name} before publish.`,
        reasoning: `The backend scan flagged ${finding.pii_type} with ${Math.round(finding.confidence * 100)}% confidence.`,
      }));
      setDraft((prev) => ({
        ...prev,
        privacy: {
          ...prev.privacy,
          scanCompleted: true,
          findings: scan.findings,
          proposals,
          decisions: {},
        },
      }));
      toast('PII scan completed.', 'success');
    } catch (error) {
      console.error('Failed to run PII scan', error);
      toast('PII scan failed.', 'error');
    } finally {
      setScanState('idle');
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      if (!operation) {
        throw new Error('Operation missing');
      }

      if (!validateStep('price_publish', draft)) {
        toast('Finish the price and publish requirements before publishing.', 'info');
        return;
      }

      if (operation.status === 'published') {
        router.push(`/publish/${operationId}/success`);
        return;
      }

      if (operation.status === 'publishing') {
        await transitionPublishOperation(operationId, 'published', 'frontend_publish_complete');
        router.push(`/publish/${operationId}/success`);
        return;
      }

      toast(`Operation is currently ${operation.status}. Final publish requires the backend FSM to reach publishing first.`, 'info');
    } catch (error) {
      console.error('Failed to publish operation', error);
      toast('Publish request failed.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    setDraft((prev) => ({
      ...prev,
      account: {
        ...prev.account,
        email: prev.account.email || user.email,
      },
    }));
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-stone-900 border-t-transparent" />
      </div>
    );
  }

  const renderStep = () => {
    switch (WIZARD_STEPS[currentStep].key) {
      case 'account':
        return <AccountLinkStep data={draft.account} onChange={(patch) => setDraft((prev) => ({ ...prev, account: { ...prev.account, ...patch } }))} />;
      case 'terms':
        return <TermsStep data={draft.terms} onChange={(patch) => setDraft((prev) => ({ ...prev, terms: { ...prev.terms, ...patch } }))} />;
      case 'privacy':
        return (
          <PrivacyStep
            data={draft.privacy}
            onChange={(patch) => setDraft((prev) => ({ ...prev, privacy: { ...prev.privacy, ...patch } }))}
            onRunScan={handleRunPiiScan}
            scanning={scanState === 'running'}
            onProposalDecision={(proposalId, statusValue, editedValue) => updateProposalDecision('privacy', proposalId, statusValue, editedValue)}
          />
        );
      case 'compliance':
        return <ComplianceStep data={draft.compliance} onChange={(patch) => setDraft((prev) => ({ ...prev, compliance: { ...prev.compliance, ...patch } }))} />;
      case 'provenance':
        return <ProvenanceStep data={draft.provenance} onChange={(patch) => setDraft((prev) => ({ ...prev, provenance: { ...prev.provenance, ...patch } }))} />;
      case 'quality':
        return (
          <QualityStep
            data={draft.quality}
            onChange={(patch) => setDraft((prev) => ({ ...prev, quality: { ...prev.quality, ...patch } }))}
            onProposalDecision={(proposalId, statusValue, editedValue) => updateProposalDecision('quality', proposalId, statusValue, editedValue)}
          />
        );
      case 'metadata':
        return (
          <MetadataStep
            data={draft.metadata}
            onChange={(patch) => setDraft((prev) => ({ ...prev, metadata: { ...prev.metadata, ...patch } }))}
            onProposalDecision={(proposalId, statusValue, editedValue) => {
              updateProposalDecision('metadata', proposalId, statusValue, editedValue);
              const proposal = draft.metadata.proposals.find((item) => item.id === proposalId);
              if (!proposal) return;
              if (proposalId === 'title' && statusValue === 'accept') {
                setDraft((prev) => ({ ...prev, metadata: { ...prev.metadata, title: proposal.value } }));
              }
              if (proposalId === 'description' && statusValue === 'accept') {
                setDraft((prev) => ({ ...prev, metadata: { ...prev.metadata, description: proposal.value } }));
              }
              if (statusValue === 'edit' && editedValue) {
                if (proposalId === 'title') setDraft((prev) => ({ ...prev, metadata: { ...prev.metadata, title: editedValue } }));
                if (proposalId === 'description') setDraft((prev) => ({ ...prev, metadata: { ...prev.metadata, description: editedValue } }));
              }
            }}
          />
        );
      case 'price_publish':
        return (
          <PricePublishStep
            data={draft.price_publish}
            context={context}
            allPriorStepsComplete={areAllPriorStepsComplete(draft)}
            onChange={(patch) => setDraft((prev) => ({ ...prev, price_publish: { ...prev.price_publish, ...patch } }))}
            onPublish={handlePublish}
            publishing={publishing}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f1e8_0%,#fffdf8_40%,#f3efe7_100%)]">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-stone-500">BQ Publish Wizard</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-950">Resume publish operation</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-stone-600">
              Explicit review gates stay in front of every allAI suggestion. Nothing is auto-accepted, and the current wizard state is saved continuously.
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <OperationStatusBadge status={status} />
            <p className="text-sm text-stone-500">
              {saveState === 'saving'
                ? 'Saving changes...'
                : saveState === 'saved'
                  ? `Saved ${lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : 'just now'}`
                  : saveState === 'error'
                    ? 'Auto-save failed'
                    : 'Ready'}
            </p>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
          <WizardStepper
            currentStep={currentStep}
            completedSteps={completedSteps}
            onSelect={navigateToStep}
            isStepUnlocked={isStepUnlocked}
          />

          <section className="rounded-[2.5rem] border border-stone-200 bg-white/85 p-6 shadow-[0_30px_100px_-60px_rgba(28,24,18,0.55)] backdrop-blur lg:p-8">
            {renderStep()}

            {currentStep < WIZARD_STEPS.length - 1 && (
              <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-stone-200 pt-6">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={currentStep === 0}
                  className="rounded-full bg-stone-100 px-5 py-3 text-sm font-semibold text-stone-700 disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white"
                >
                  Continue
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
