import type { DataRequestDetail } from '@/types';

// Exact public_hash_v1 projection at backend 434019ff. Not an owner/profile projection.
export interface RequestPublicContent {
  title: string | null;
  description: string;
  provenance_requirements: string | null;
  categories: string[] | null;
  format_preferences: string[] | null;
  regulatory_requirements: string[] | null;
  price_range_min: string | null;
  price_range_max: string | null;
  currency: string | null;
  urgency: string | null;
}
export interface RequestPublicationPreview {
  public_content: RequestPublicContent;
  public_content_hash: string;
  source_content_hash: string;
}
const keys = ['categories', 'currency', 'description', 'format_preferences', 'price_range_max', 'price_range_min', 'provenance_requirements', 'regulatory_requirements', 'title', 'urgency'] as const;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function parsePublicationPreview(value: unknown): RequestPublicationPreview | null {
  const unavailable = () => new Error('Public preview unavailable. Review your request and try again.');
  if (!value || typeof value !== 'object') throw unavailable();
  const envelope = value as Record<string, unknown>;
  if (envelope.acceptance_required !== true || !('preview' in envelope)) throw unavailable();
  if (envelope.preview === null) return null;
  if (!envelope.preview || typeof envelope.preview !== 'object') throw unavailable();
  const proposal = envelope.preview as Record<string, unknown>;
  if (!hash(proposal.source_content_hash) || !hash(proposal.public_content_hash)) throw unavailable();
  const content = proposal.public_content;
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw unavailable();
  const fields = content as Record<string, unknown>;
  if (Object.keys(fields).sort().join() !== [...keys].sort().join()) throw unavailable();
  for (const key of keys) {
    const item = fields[key];
    if (['categories', 'format_preferences', 'regulatory_requirements'].includes(key)) {
      if (item !== null && (!Array.isArray(item) || !item.every(v => typeof v === 'string'))) throw unavailable();
    } else if (item !== null && typeof item !== 'string') throw unavailable();
  }
  if (typeof fields.description !== 'string' || !fields.description.trim()) throw unavailable();
  for (const key of ['price_range_min', 'price_range_max']) {
    if (fields[key] !== null && !/^\d+\.\d{2}$/.test(fields[key] as string)) throw unavailable();
  }
  return { source_content_hash: proposal.source_content_hash, public_content_hash: proposal.public_content_hash,
    public_content: Object.fromEntries(keys.map(key => [key, fields[key]])) as unknown as RequestPublicContent };
}
const normalize = (value: string) => value.replace(/\r\n?/g, '\n').normalize('NFC');
export function currentPublicContent(request: DataRequestDetail): RequestPublicContent {
  const list = (value: string[] | undefined) => value == null ? null : [...new Set(value.map(normalize))].sort();
  return {
    title: request.title == null ? null : normalize(request.title), description: normalize(request.description),
    provenance_requirements: request.provenance_requirements == null ? null : normalize(request.provenance_requirements),
    categories: list(request.categories), format_preferences: list(request.format_preferences),
    regulatory_requirements: list(request.regulatory_requirements), currency: request.currency == null ? null : normalize(request.currency.toUpperCase()),
    urgency: request.urgency == null ? null : normalize(request.urgency),
    price_range_min: request.price_range_min == null ? null : Number(request.price_range_min).toFixed(2),
    price_range_max: request.price_range_max == null ? null : Number(request.price_range_max).toFixed(2),
  };
}
export function samePublicContent(a: RequestPublicContent, b: RequestPublicContent) {
  return keys.every(key => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}
export function samePublicationSource(a: DataRequestDetail, b: DataRequestDetail) {
  return a.id === b.id && a.slug === b.slug && a.buyer_id === b.buyer_id && a.public_content_hash === b.public_content_hash
    && a.required_public_consent_policy_version === b.required_public_consent_policy_version
    && a.publication_decision_version === b.publication_decision_version && a.updated_at === b.updated_at
    && a.status === b.status && a.publication_decision === b.publication_decision
    && a.public_consent_status === b.public_consent_status && a.publication_reason === b.publication_reason
    && samePublicContent(currentPublicContent(a), currentPublicContent(b));
}
