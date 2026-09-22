import {api} from './client';

export interface SellerAcceptance {
  signer_name: string;
  signer_title: string;
  authority_confirmed: boolean;
}

export interface LicenseSelection {
  kind: 'standard' | 'custom';
  version: '1.0';
  ai_training: boolean;
  license_document_id: string | null;
  license_sha256: string;
  rider_sha256: string | null;
  covenant_code: 'marketplace-listing';
  covenant_version: '1.0';
  covenant_sha256: string;
  seller_acceptance: SellerAcceptance;
}

export interface CustomLicenseUpload {
  id: string;
  title: string;
  content_type: 'text/plain' | 'application/pdf';
  size_bytes: number;
  source_sha256: string;
  license_sha256: string;
  status: 'active';
}

export function licenseDocumentPath(kind: 'standard' | 'covenant' | 'rider' | 'custom', value?: boolean | string): string {
  if (kind === 'standard') return `/licenses/standard/1.0/${value === false ? 'no-ai-training' : 'ai-training'}`;
  if (kind === 'covenant') return '/licenses/marketplace-listing/1.0';
  if (kind === 'rider') return `/licenses/ai-training-rider/1.0/${value === false ? 'not-permitted' : 'permitted'}`;
  return `/licenses/custom/${encodeURIComponent(String(value))}`;
}

export const LICENSE_HASHES = {
  standard: {
    true: '4b05dbcd0c186746d3deab6c68beaebba88610de8e85122efb4d527edb1263c6',
    false: 'e83e03bb731fee832d108ef77689f7ff49e3409f88124b483b2ef34ca7ba3821',
  },
  rider: {
    true: 'f9785144dc4d48af6446512cbabd03431a35015d71b92260f4dcfab164084140',
    false: '8878e2fb3327378e90a1d9206da9aa2b419255872cdfa6a883c0d2688f768416',
  },
  covenant: 'a91234b67bf7467a0c80f6e1caa47b563032e94751146901b796eaaf220431af',
} as const;

export function createStandardSelection(aiTraining = true): LicenseSelection {
  return {
    kind: 'standard', version: '1.0', ai_training: aiTraining, license_document_id: null,
    license_sha256: LICENSE_HASHES.standard[String(aiTraining) as 'true' | 'false'], rider_sha256: null,
    covenant_code: 'marketplace-listing', covenant_version: '1.0', covenant_sha256: LICENSE_HASHES.covenant,
    seller_acceptance: {signer_name: '', signer_title: '', authority_confirmed: false},
  };
}

export async function uploadCustomLicense(file: File, aiTraining: boolean): Promise<CustomLicenseUpload> {
  const body = new FormData();
  body.append('upload', file);
  body.append('title', file.name);
  body.append('ai_training', String(aiTraining));
  const result = (await api.post<CustomLicenseUpload>('/licenses/custom', body)).data;
  if (!result || Object.keys(result).sort().join(',') !== 'content_type,id,license_sha256,size_bytes,source_sha256,status,title' ||
      !/^[0-9a-f-]{36}$/.test(result.id) || result.title !== file.name ||
      !['text/plain', 'application/pdf'].includes(result.content_type) ||
      !Number.isSafeInteger(result.size_bytes) || result.size_bytes !== file.size ||
      result.status !== 'active' ||
      ![result.source_sha256, result.license_sha256].every(hash => /^[a-f0-9]{64}$/.test(hash))) {
    throw new Error('Custom licence upload could not be verified');
  }
  return result;
}

export function isCompleteLicenseSelection(value: LicenseSelection): boolean {
  return value.seller_acceptance.authority_confirmed && Boolean(value.seller_acceptance.signer_name.trim()) &&
    Boolean(value.seller_acceptance.signer_title.trim()) && /^[a-f0-9]{64}$/.test(value.license_sha256) &&
    /^[a-f0-9]{64}$/.test(value.covenant_sha256) &&
    (value.kind === 'standard' ? value.license_document_id === null && value.rider_sha256 === null :
      Boolean(value.license_document_id) && Boolean(value.rider_sha256 && /^[a-f0-9]{64}$/.test(value.rider_sha256)));
}
