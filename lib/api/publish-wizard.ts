'use client';

import { api } from '@/api/client';

export type PublishStatus =
  | 'draft'
  | 'extracting'
  | 'reviewing'
  | 'enriching'
  | 'publishing'
  | 'published'
  | 'failed';

export interface PublishOperationResponse {
  id: string;
  device_id: string;
  user_id: string;
  status: PublishStatus;
  idempotency_key: string;
  retry_count: number;
  last_retry_at: string | null;
  wizard_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WizardStepData {
  step_index: number;
  step_key: string;
  completed: boolean;
  form_data: Record<string, unknown>;
  allai_proposals?: Record<string, unknown> | null;
  allai_proposal_decisions?: Record<string, unknown> | null;
}

export interface WizardStateUpdate {
  current_step: number;
  steps: Record<string, WizardStepData>;
}

export interface WizardStateResponse {
  operation_id: string;
  current_step: number;
  steps: Record<string, WizardStepData>;
  fsm_status: PublishStatus;
  updated_at: string;
}

export interface PIIFinding {
  column_name: string;
  pii_type: string;
  confidence: number;
  redaction_action: string;
  detection_layer: string;
}

export interface PIIScanResult {
  operation_id: string;
  findings: PIIFinding[];
  scan_layers_used: string[];
  columns_scanned: number;
  scan_duration_ms?: number | null;
}

export async function getPublishOperation(operationId: string) {
  const { data } = await api.get<PublishOperationResponse>(`/publish-wizard/operations/${operationId}`);
  return data;
}

export async function getWizardState(operationId: string) {
  const { data } = await api.get<WizardStateResponse>(`/publish-wizard/${operationId}/wizard-state`);
  return data;
}

export async function saveWizardState(operationId: string, payload: WizardStateUpdate) {
  const { data } = await api.put<WizardStateResponse>(`/publish-wizard/${operationId}/wizard-state`, payload);
  return data;
}

export async function runPiiScan(operationId: string) {
  const { data } = await api.post<PIIScanResult>(`/publish-wizard/operations/${operationId}/pii-scan`);
  return data;
}

export async function transitionPublishOperation(
  operationId: string,
  targetStatus: PublishStatus,
  reason?: string,
) {
  const { data } = await api.post(`/publish-wizard/operations/${operationId}/transition`, {
    target_status: targetStatus,
    reason,
  });
  return data;
}
