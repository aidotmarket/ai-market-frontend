import { postSessionMutation } from './session-mutation';
import { customerConversation, type CustomerMessage } from './support';
import { recoveryUUID, recoveryRecord, type RecoveryContext } from './support-recovery';

export type ViewReportTarget = { view: 'wallet'; wallet_offset: number }
  | { view: 'request_thread'; request_id: string; response_id: string }
  | { view: 'support_conversation'; support_ref: string };
export type ViewReport = ViewReportTarget & { report_id: string; description: string; failure: RecoveryContext['failure'] };
export interface ViewReportReceipt {
  public_ref: string; conversation_id: string; received_at: string; status: string; next_action: string;
  original: { category: 'other'; description: string; failed_operation: string };
  email_state: 'pending'; acknowledgement: CustomerMessage;
}
export function viewReportReceipt(value: unknown, report: ViewReport): ViewReportReceipt {
  const r = recoveryRecord(value), original = recoveryRecord(r.original);
  recoveryUUID(r.conversation_id);
  if (Object.keys(r).some(k => !['public_ref', 'conversation_id', 'received_at', 'status', 'next_action', 'original', 'email_state', 'acknowledgement'].includes(k))
    || Object.keys(original).some(k => !['category', 'description', 'failed_operation'].includes(k))
    || original.category !== 'other' || original.description !== report.description
    || original.failed_operation !== report.view + ':' + report.failure || r.email_state !== 'pending'
    || typeof r.received_at !== 'string' || !Number.isFinite(Date.parse(r.received_at))
    || typeof r.public_ref !== 'string' || !r.public_ref || r.public_ref.length > 80) throw new Error('VIEW_REPORT_WIRE_INVALID');
  const conversation = customerConversation({ ...r, messages: [r.acknowledgement], next_cursor: null });
  if (conversation.messages[0].direction !== 'outbound') throw new Error('VIEW_REPORT_WIRE_INVALID');
  // Keep the exact immutable receipt; do not substitute a later ticket projection.
  return r as unknown as ViewReportReceipt;
}
export async function reportView(report: ViewReport, assertCurrent: () => void): Promise<ViewReportReceipt> {
  assertCurrent();
  const value = await postSessionMutation('/support/view-reports', report, assertCurrent);
  assertCurrent();
  return viewReportReceipt(value, report);
}
