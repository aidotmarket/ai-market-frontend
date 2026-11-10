import {api} from './client';
import {MAX_CUSTOM_LICENSE_CODEPOINTS, canonicalizeCustomText, verifyCustomText} from '@/lib/customLicenseVerification';

export interface SellerAcceptance {
  signer_name: string;
  signer_title: string;
  authority_confirmed: boolean;
}

export interface LicenseSelection {
  identity_version?: number | null;
  kind: 'standard' | 'custom';
  version: '1.0' | '1.1';
  ai_training: boolean;
  license_document_id: string | null;
  license_sha256: string;
  rider_sha256: string | null;
  covenant_code: 'marketplace-listing';
  covenant_version: '1.0' | '1.1';
  covenant_sha256: string;
  seller_acceptance: SellerAcceptance;
}

export interface CustomLicenseSubmission {
  id: string;
  title: string;
  text: string;
  content_type: 'text/plain';
  size_bytes: number;
  source_sha256: string;
  license_sha256: string;
  status: 'active';
}

export const CURRENT_STANDARD_VERSION = '1.1';
export const CURRENT_COVENANT_VERSION = '1.1';

export function licenseDocumentPath(kind: 'standard' | 'covenant' | 'rider', value?: boolean, version: string = kind === 'rider' ? '1.0' : '1.1'): string {
  if (kind === 'standard') return `/licenses/standard/${version}/${value === false ? 'no-ai-training' : 'ai-training'}`;
  if (kind === 'covenant') return `/licenses/marketplace-listing/${version}`;
  if (kind === 'rider') return `/licenses/ai-training-rider/1.0/${value === false ? 'not-permitted' : 'permitted'}`;
  throw new Error('Unknown licence document');
}

export const LICENSE_HASHES_1_0 = {
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

// Hashes of the exact 1.1 documents, domain-separated by instrument version.
export const LICENSE_HASHES = {
  standard: {
    true: '881266a455d100e6b263ec121523001e5e53f6e3bf3bd97047e29ae39f8959fb',
    false: '0bec503dac137e80fa405f47e9ecded8a424ca73f794f8eef54d01ff10d25317',
  },
  rider: LICENSE_HASHES_1_0.rider,
  covenant: '58eff1def7acb59db75920fe0da89a3f4f87bb12bd6765ec8eae231bbea118b5',
} as const;

export function licenseHashesFor(version: string) {
  if (version === '1.0') return LICENSE_HASHES_1_0;
  if (version === '1.1') return LICENSE_HASHES;
  throw new Error('Unsupported licence version');
}

export function createStandardSelection(aiTraining = true): LicenseSelection {
  return {
    kind: 'standard', version: CURRENT_STANDARD_VERSION, ai_training: aiTraining, license_document_id: null,
    license_sha256: LICENSE_HASHES.standard[String(aiTraining) as 'true' | 'false'], rider_sha256: null,
    covenant_code: 'marketplace-listing', covenant_version: CURRENT_COVENANT_VERSION, covenant_sha256: LICENSE_HASHES.covenant,
    seller_acceptance: {signer_name: '', signer_title: '', authority_confirmed: false},
  };
}

export async function submitCustomLicenseText(title: string, text: string, aiTraining: boolean): Promise<CustomLicenseSubmission> {
  if (Array.from(canonicalizeCustomText(text)).length > MAX_CUSTOM_LICENSE_CODEPOINTS || !text.trim()) throw new Error('LICENSE_SIZE_INVALID');
  const response = await api.post('/licenses/custom', {title, ai_training: aiTraining, text}, {headers: {'Content-Type': 'application/json'}});
  if (response.status !== 201) throw new Error('Custom licence response could not be verified');
  const raw: unknown = response.data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Custom licence response could not be verified');
  const result = raw as Record<string, unknown>;
  const keys = 'content_type,id,license_sha256,size_bytes,source_sha256,status,text,title';
  if (Object.keys(result).sort().join(',') !== keys ||
      typeof result.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.id) ||
      typeof result.title !== 'string' || result.title !== title.trim() ||
      typeof result.text !== 'string' || result.text !== canonicalizeCustomText(text) || result.content_type !== 'text/plain' ||
      !Number.isSafeInteger(result.size_bytes) || (result.size_bytes as number) < 1 ||
      result.size_bytes !== new TextEncoder().encode(result.text).length ||
      result.status !== 'active' ||
      typeof result.source_sha256 !== 'string' || typeof result.license_sha256 !== 'string' ||
      await verifyCustomText(new TextEncoder().encode(result.text), result.source_sha256, result.license_sha256, aiTraining) === null) {
    throw new Error('Custom licence response could not be verified');
  }
  return result as unknown as CustomLicenseSubmission;
}

export function isCurrentLicenseSelection(value: LicenseSelection): boolean {
  return value.covenant_code === 'marketplace-listing' && value.covenant_version === CURRENT_COVENANT_VERSION &&
    (value.kind !== 'standard' || value.version === CURRENT_STANDARD_VERSION);
}

export function isCompleteLicenseSelection(value: LicenseSelection): boolean {
  return value.seller_acceptance.authority_confirmed && Boolean(value.seller_acceptance.signer_name.trim()) &&
    Boolean(value.seller_acceptance.signer_title.trim()) && /^[a-f0-9]{64}$/.test(value.license_sha256) &&
    /^[a-f0-9]{64}$/.test(value.covenant_sha256) &&
    (value.kind === 'standard' ? value.license_document_id === null && value.rider_sha256 === null :
      Boolean(value.license_document_id) && Boolean(value.rider_sha256 && /^[a-f0-9]{64}$/.test(value.rider_sha256)));
}

// New acceptances require current terms; historical read validation stays version-aware.
export function isSignableLicenseSelection(value: LicenseSelection): boolean {
  return isCurrentLicenseSelection(value) && isCompleteLicenseSelection(value);
}
