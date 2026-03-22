import type { PIIFinding, PublishStatus } from '@/lib/api/publish-wizard';

export const WIZARD_STEPS = [
  { key: 'account', label: 'Account Link' },
  { key: 'terms', label: 'Terms' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'provenance', label: 'Provenance' },
  { key: 'quality', label: 'Quality' },
  { key: 'metadata', label: 'Metadata' },
  { key: 'price_publish', label: 'Price & Publish' },
] as const;

export type WizardStepKey = (typeof WIZARD_STEPS)[number]['key'];
export type ProposalDecisionValue = 'pending' | 'accept' | 'edit' | 'reject';

export interface ProposalCardData {
  id: string;
  label: string;
  value: string;
  reasoning: string;
}

export interface ProposalDecisionState {
  status: ProposalDecisionValue;
  editedValue?: string;
}

export interface AccountLinkData {
  linked: boolean;
  email: string;
  deviceLabel: string;
}

export interface TermsData {
  accepted: boolean;
  acceptedAt?: string;
}

export interface PrivacyData {
  scanCompleted: boolean;
  findings: PIIFinding[];
  notes: string;
  proposals: ProposalCardData[];
  decisions: Record<string, ProposalDecisionState>;
}

export interface ComplianceData {
  frameworks: string[];
  handlingPII: string;
  crossBorderTransfers: string;
  regulatedData: string;
}

export interface ProvenanceData {
  source: string;
  collectionMethod: string;
  collectionDates: string;
  geoCoverage: string;
  processingSummary: string;
  license: string;
}

export interface QualityData {
  scores: Record<string, number>;
  syntheticPreview: string[];
  proposals: ProposalCardData[];
  decisions: Record<string, ProposalDecisionState>;
}

export interface MetadataData {
  title: string;
  description: string;
  tags: string[];
  category: string;
  proposals: ProposalCardData[];
  decisions: Record<string, ProposalDecisionState>;
}

export interface PricePublishData {
  price: string;
  allStepsComplete: boolean;
  confirmationChecked: boolean;
  checklist: {
    oneTimeOnly: boolean;
    reviewedPrivacy: boolean;
    reviewedMetadata: boolean;
  };
}

export interface PublishWizardDraft {
  account: AccountLinkData;
  terms: TermsData;
  privacy: PrivacyData;
  compliance: ComplianceData;
  provenance: ProvenanceData;
  quality: QualityData;
  metadata: MetadataData;
  price_publish: PricePublishData;
}

export interface PublishWizardContextSnapshot {
  operationId: string;
  status: PublishStatus;
  currentStep: number;
  lastSavedAt: string | null;
}
