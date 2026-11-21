import type { DataRequestDetail, DataRequestListItem, RequestPublicationPreparation } from '@/types';

export const buyerRequestAnonymizationEnabled = () =>
  process.env.NEXT_PUBLIC_BUYER_REQUEST_ANONYMIZATION_ENABLED === 'true';

export function ownerRequestHref(request: Pick<DataRequestListItem, 'id' | 'slug'>): string {
  return `/requests/${encodeURIComponent(request.slug || request.id)}`;
}

export function isRequestId(value: string): boolean {
  return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
}

export function hasPrivatePublication(request: DataRequestDetail): boolean {
  return !request.slug || request.publication_preparation != null;
}

export function exactPublicationPreview(preparation: RequestPublicationPreparation | null | undefined) {
  if (preparation?.status !== 'preview_ready') return null;
  const { binding, presentation } = preparation;
  if (!binding?.revision || !/^[a-f0-9]{64}$/.test(binding?.render_digest ?? '')
    || !binding.screening_policy_version || !preparation.public_content_hash || !preparation.policy_version
    || !presentation?.language || !presentation.slug || !Array.isArray(presentation.fields)
    || !presentation.fields.length
    || !presentation.fields.every(field => typeof field?.label === 'string' && typeof field.value === 'string')) return null;
  return preparation;
}
