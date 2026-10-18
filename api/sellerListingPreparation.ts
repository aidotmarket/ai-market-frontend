import axios from 'axios';
import {nativeClient,nativeSession} from './connector-seller-settings';
import {validView,type PreparationView,type SigningInstrument} from './seller-batch-signing';
import {sameLicenseSelection,type ApprovalReceipt} from './sellerListingReview';
import {isCompleteLicenseSelection} from './listingLicenses';

export type PreparedListing = PreparationView & Pick<Partial<SigningInstrument>, 'license_selection'>;
export type PreparationRequest = {request_id:string;draft_id:string;expected_draft_version:number;approval_id:string;review_hash:string;render_hash:string};
export function preparationRequest(approval:ApprovalReceipt):PreparationRequest {
  if (!approval.draft_id) throw new Error('PREPARATION_STALE');
  return {request_id:crypto.randomUUID(),draft_id:approval.draft_id,expected_draft_version:approval.draft_version,
    approval_id:approval.id,review_hash:approval.review_hash,render_hash:approval.render_hash};
}
function verified(value:PreparedListing, approval:ApprovalReceipt):PreparedListing {
  if (!validView(value) || (value.license_selection && (!isCompleteLicenseSelection(value.license_selection) ||
      (approval.license_selection && !sameLicenseSelection(value.license_selection,approval.license_selection)))) || value.binding.draft_id!==approval.draft_id || value.binding.draft_version!==approval.draft_version ||
      value.binding.approval_id!==approval.id || value.binding.render_hash!==approval.render_hash ||
      (['signed','published'].includes(value.status) ? !/^[a-f0-9]{64}$/.test(value.signed_coverage_hash??'') : value.signed_coverage_hash!=null))
    throw new Error('INVALID_PREPARATION');
  return value;
}
export async function lookupPreparation(approval:ApprovalReceipt,signal:AbortSignal):Promise<PreparedListing|null> {
  const session=nativeSession();
  try {
    const {data}=await nativeClient.get('/seller-workspace/listing-preparation', {signal,headers:session.headers,
      params:{draft_id:approval.draft_id,draft_version:approval.draft_version}});
    if(nativeSession().token!==session.token)throw new Error('SESSION_CHANGED');
    return verified(data,approval);
  } catch(error) {
    if(axios.isAxiosError(error)&&error.response?.status===404&&error.response.data?.detail==='NOT_FOUND')return null;
    throw error;
  }
}
export async function prepareListing(request:PreparationRequest,approval:ApprovalReceipt,signal:AbortSignal):Promise<PreparedListing> {
  const session=nativeSession();
  const {data}=await nativeClient.post('/seller-workspace/listing-preparation', {...request,csrf:session.csrf}, {signal,headers:session.headers});
  if(nativeSession().token!==session.token)throw new Error('SESSION_CHANGED');
  return {...verified(data,approval),license_selection:approval.license_selection};
}
export function preparationErrorCode(error:unknown):string|undefined {
  const detail=axios.isAxiosError(error)?error.response?.data?.detail:undefined;
  return typeof detail==='string'?detail:typeof detail?.code==='string'?detail.code:error instanceof Error?error.message:undefined;
}
export function preparationError(error:unknown):string {
  const status=axios.isAxiosError(error)?error.response?.status:undefined;
  const code=preparationErrorCode(error);
  if(status===401||code==='FIRST_PARTY_SESSION_REQUIRED')return 'Sign in again to prepare this listing.';
  if(status===403)return 'Preparation is not allowed by the current seller policy.';
  if(status===404)return 'Listing preparation is currently unavailable.';
  if(status===503)return 'Approval or policy checks are currently unavailable. Retry this same preparation.';
  switch(code) {
    case 'PREPARATION_EXISTS':return 'A preparation already exists. Refresh preparation status to recover it.';
    case 'IDEMPOTENCY_CONFLICT':return 'This request no longer matches the saved preparation. Refresh the saved review before preparing again.';
    case 'LICENSE_SIGNING_UNAVAILABLE':return 'Licence signing is currently unavailable for this listing.';
    case 'PREPARATION_STALE':return 'The listing or files changed. Refresh the saved review and approve it again.';
    default:return 'Preparation could not be confirmed. Retry the same preparation or refresh its status.';
  }
}
export const preparationStatus = {prepared:'Needs signing',signed:'Ready to publish here or from Claude',published:'Published',superseded:'Superseded'};
