// Wire contract: backend 2bc41701, app/schemas/pending_action.py.
export type SafeBatchValue = string | number | boolean | null;
export interface SellerBatchItemSummary {
  item_id: string;
  target_id: string;
  result_index: number;
  action: string;
  action_version: string;
  status: 'eligible' | 'blocked';
  reason: string;
  args_hash: string;
  facts_hash: string;
  binding_hash: string;
  before: Record<string, SafeBatchValue>;
  after: Record<string, SafeBatchValue>;
  references: Record<string, SafeBatchValue>;
  policy_reasons: string[];
}
interface SellerManifest {
  format_version: '1';
  action: string;
  action_version: string;
  user_id: string;
  org_id: string | null;
  client_id: string;
  client_display_name: string;
  grant_id: string;
  profile: 'claude';
  tool_set: 'seller';
  verb: 'update' | 'publish' | 'unpublish';
  requested_at: string;
  execution_deadline: string;
  requested_count: number;
  eligible_count: number;
  blocked_count: number;
  limit_version: number;
  proposed_usage: number;
  items: SellerBatchItemSummary[];
}

export interface SellerBatchSummary extends SellerManifest, Record<string, unknown> {
  summary_type: 'seller_batch_v1'; execution_semantics: 'best_effort_partial';
}

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const uuid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;
const time = (value: unknown) => text(value) && /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const safeMap = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.values(value).every(v => v === null || typeof v === 'string' || typeof v === 'boolean' || Number.isSafeInteger(v));
const summaryKeys = new Set(['summary_type', 'format_version', 'action', 'action_version', 'user_id', 'org_id', 'client_id',
  'client_display_name', 'grant_id', 'profile', 'tool_set', 'verb', 'requested_at', 'execution_deadline', 'requested_count',
  'eligible_count', 'blocked_count', 'limit_version', 'proposed_usage', 'execution_semantics', 'items']);
const itemKeys = new Set(['item_id', 'target_id', 'result_index', 'action', 'action_version', 'status', 'reason', 'args_hash',
  'facts_hash', 'binding_hash', 'before', 'after', 'references', 'policy_reasons']);

// Fail closed on an incomplete, reordered or oversized manifest. Never repair,
// split, select, or hash a display page to authorize a different set.
export function isSellerBatchSummary(value: Record<string, unknown>): value is SellerBatchSummary {
  if (Object.keys(value).some(key => !summaryKeys.has(key)) || value.summary_type !== 'seller_batch_v1' || value.format_version !== '1'
    || !['action', 'action_version', 'client_id', 'client_display_name'].every(k => text(value[k]))
    || !uuid(value.user_id) || !(value.org_id === null || uuid(value.org_id)) || !uuid(value.grant_id)
    || value.profile !== 'claude' || value.tool_set !== 'seller' || !['update', 'publish', 'unpublish'].includes(String(value.verb))
    || !time(value.requested_at) || !time(value.execution_deadline) || value.execution_semantics !== 'best_effort_partial'
    || !integer(value.requested_count, 50) || Number(value.requested_count) < 1
    || !integer(value.eligible_count, 50) || !integer(value.blocked_count, 50)
    || !integer(value.limit_version) || !integer(value.proposed_usage, 50)
    || !Array.isArray(value.items) || value.items.length !== value.requested_count) return false;
  const items: SellerBatchItemSummary[] = value.items;
  if (!items.every(item => item && Object.keys(item).every(key => itemKeys.has(key)) && uuid(item.item_id) && uuid(item.target_id) && integer(item.result_index, 49)
    && text(item.action) && text(item.action_version) && ['eligible', 'blocked'].includes(item.status) && text(item.reason)
    && digest(item.args_hash) && digest(item.facts_hash) && digest(item.binding_hash)
    && safeMap(item.before) && safeMap(item.after) && safeMap(item.references)
    && Array.isArray(item.policy_reasons) && item.policy_reasons.every(v => typeof v === 'string'))) return false;
  return Number(value.eligible_count) + Number(value.blocked_count) === items.length
    && items.filter(item => item.status === 'eligible').length === value.eligible_count
    && new Set(items.map(item => item.item_id)).size === items.length
    && new Set(items.map(item => item.target_id)).size === items.length
    && items.every((item, i) => i === 0 || items[i - 1].target_id < item.target_id)
    && items.map(item => item.result_index).sort((a, b) => a - b).every((index, i) => index === i);
}

export interface SellerSingleSummary extends SellerManifest, Record<string, unknown> { summary_type: 'seller_single_v1'; execution_semantics: 'single' }
export function isSellerSingleSummary(value: Record<string, unknown>): value is SellerSingleSummary {
  return value.summary_type === 'seller_single_v1' && value.execution_semantics === 'single' && value.requested_count === 1
    && isSellerBatchSummary({ ...value, summary_type: 'seller_batch_v1', execution_semantics: 'best_effort_partial' });
}
