// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useState} from 'react';
import SellerLicenseSelection from './SellerLicenseSelection';
import SellerApproval from './SellerApproval';
import {createStandardSelection,type LicenseSelection} from '@/api/listingLicenses';
import {approveListingReview,reviewConfirmationKeys,type ListingReview} from '@/api/sellerListingReview';
import {COVENANT_AUTHORITY_CONFIRMATION} from '@/lib/sellerCovenantConfirmation';
import {useAuthStore} from '@/store/auth';
import type {User} from '@/types';

const transport=vi.hoisted(()=>({post:vi.fn(),get:vi.fn()}));
vi.mock('@/api/client',async(importOriginal)=>({...await importOriginal<typeof import('@/api/client')>(),api:transport}));
const legal=vi.hoisted(()=>({getSellerLegalIdentity:vi.fn(),refreshSellerLegalIdentity:vi.fn(),saveSellerLegalIdentity:vi.fn(),getLastSigner:vi.fn()}));
vi.mock('@/api/sellerLegalIdentity',async(importOriginal)=>({...await importOriginal<typeof import('@/api/sellerLegalIdentity')>(),...legal}));
vi.mock('./SellerPublication',()=>({default:()=>null}));

function signIn(id:string|null){
  useAuthStore.setState({user:id?{id} as User:null,token:id?`synthetic-${id}`:null,isAuthenticated:!!id,hydrated:true,isLoading:false});
}
function Harness({initial=createStandardSelection()}:{initial?:LicenseSelection}) {
  const [value,setValue]=useState(initial);
  return <><SellerLicenseSelection value={value} onChange={setValue}/><output data-testid="wire">{JSON.stringify(value)}</output></>;
}
const wire=()=>JSON.parse(screen.getByTestId('wire').textContent??'{}') as LicenseSelection;
const field=(name:string)=>screen.getByRole<HTMLInputElement>('textbox',{name});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};}

beforeEach(()=>{vi.resetAllMocks();signIn('seller-a');});
afterEach(()=>{cleanup();signIn(null);});

describe('remembered signer',()=>{
  it('pre-fills a returning seller from their last signature, still editable',async()=>{
    legal.getLastSigner.mockResolvedValue({signer_name:'Ada Byron',signer_title:'Director',signed_at:'2026-11-20T10:00:00Z'});
    render(<Harness/>);
    await screen.findByText(/filled in from your last licence signature/);
    expect(field('Signer full name').value).toBe('Ada Byron');
    expect(field('Signer title').value).toBe('Director');
    // Pre-filling never confirms the covenant on the seller's behalf.
    expect(wire().seller_acceptance.authority_confirmed).toBe(false);
    fireEvent.change(field('Signer title'),{target:{value:'CEO'}});
    expect(wire().seller_acceptance).toMatchObject({signer_name:'Ada Byron',signer_title:'CEO'});
  });
  it('leaves the fields empty for a seller with no earlier signature',async()=>{
    legal.getLastSigner.mockResolvedValue({signer_name:null,signer_title:null,signed_at:null});
    render(<Harness/>);
    await act(async()=>{});
    expect(legal.getLastSigner).toHaveBeenCalledTimes(1);
    expect(field('Signer full name').value).toBe('');
    expect(field('Signer title').value).toBe('');
    expect(screen.queryByText(/filled in from your last licence signature/)).toBeNull();
  });
  it('never applies one account\'s signer to another account',async()=>{
    const pending=deferred<{signer_name:string;signer_title:string;signed_at:string}>();
    // Seller A's answer arrives only after seller B has signed in; B has no earlier signature.
    legal.getLastSigner.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({signer_name:null,signer_title:null,signed_at:null});
    render(<Harness/>);
    act(()=>signIn('seller-b'));
    await act(async()=>{pending.resolve({signer_name:'Ada Byron',signer_title:'Director',signed_at:'2026-11-20T10:00:00Z'});});
    expect(legal.getLastSigner).toHaveBeenCalledTimes(2);
    expect(wire().seller_acceptance).toMatchObject({signer_name:'',signer_title:''});
  });
  it('does not overwrite signer details already on the listing, and fails quietly',async()=>{
    const saved=createStandardSelection();saved.seller_acceptance={signer_name:'Grace Hopper',signer_title:'CTO',authority_confirmed:false};
    legal.getLastSigner.mockResolvedValue({signer_name:'Ada Byron',signer_title:'Director',signed_at:'2026-11-20T10:00:00Z'});
    render(<Harness initial={saved}/>);
    await act(async()=>{});
    expect(legal.getLastSigner).not.toHaveBeenCalled();
    expect(field('Signer full name').value).toBe('Grace Hopper');
    cleanup();
    legal.getLastSigner.mockRejectedValue(new Error('offline'));
    render(<Harness/>);
    await act(async()=>{});
    expect(field('Signer full name').value).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

const selection=():LicenseSelection=>{const s=createStandardSelection();s.seller_acceptance={signer_name:'Ada Byron',signer_title:'Director',authority_confirmed:true};return s;};
const statements={ownership_confirmed:'I have rights.',privacy_confirmed:'I reviewed it.',public_disclosure_confirmed:'It becomes public.',
  price_confirmed:'I confirm the price.',license_confirmed:'I confirm the licence.',covenant_authority_confirmed:'I accept the covenant.'};
function review(version:'seller-listing-confirmation-v3'|'seller-listing-confirmation-v4'):ListingReview {
  const {covenant_authority_confirmed,...v4}=statements;
  return {approval_available:true,review_hash:'a'.repeat(64),render_hash:'b'.repeat(64),confirmation_version:version,
    confirmation_statements:version==='seller-listing-confirmation-v4'?v4:{...v4,covenant_authority_confirmed},
    license_selection:selection(),draft_version:1,source_version:1,sample_decision:'none'} as unknown as ListingReview;
}

describe('one covenant and authority confirmation per listing',()=>{
  it('asks for it in the licence step, once, with the kept wording, and again after a licence change',async()=>{
    legal.getLastSigner.mockResolvedValue({signer_name:null,signer_title:null,signed_at:null});
    render(<Harness/>);
    await act(async()=>{});
    const tick=screen.getByRole<HTMLInputElement>('checkbox',{name:'Confirm covenant and authority'});
    expect(tick.parentElement?.textContent).toContain(COVENANT_AUTHORITY_CONFIRMATION);
    fireEvent.click(tick);
    expect(wire().seller_acceptance.authority_confirmed).toBe(true);
    fireEvent.click(screen.getByRole('checkbox',{name:'Allow AI/ML training'}));
    expect(wire().seller_acceptance.authority_confirmed).toBe(false);
  });
  it('does not ask again in the review; shows it as already confirmed',()=>{
    render(<SellerApproval review={review('seller-listing-confirmation-v4')} active rendered/>);
    expect(screen.queryByText('I accept the covenant.')).toBeNull();
    expect(screen.getByRole('note',{name:'Covenant and authority confirmed'}).textContent).toContain(COVENANT_AUTHORITY_CONFIRMATION);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });
  it('keeps the previous review contract unchanged while the server still sends v3',()=>{
    render(<SellerApproval review={review('seller-listing-confirmation-v3')} active rendered/>);
    expect(screen.getByText('I accept the covenant.')).toBeTruthy();
    expect(screen.queryByRole('note',{name:'Covenant and authority confirmed'})).toBeNull();
    expect(reviewConfirmationKeys(review('seller-listing-confirmation-v3'))).toContain('covenant_authority_confirmed');
    expect(reviewConfirmationKeys(review('seller-listing-confirmation-v4'))).not.toContain('covenant_authority_confirmed');
  });
  it.each(['seller-listing-confirmation-v3','seller-listing-confirmation-v4'] as const)('sends the %s approval body',async(version)=>{
    const current=review(version);
    transport.post.mockResolvedValue({data:{id:'approved',review_hash:current.review_hash,render_hash:current.render_hash,draft_version:1,source_version:1,
      sample_decision:'none',approved_at:'2026-11-23T10:00:00Z',license_selection:current.license_selection}});
    await approveListingReview(current,'00000000-0000-4000-8000-000000000001',new AbortController().signal);
    const body=transport.post.mock.calls[0][1];
    expect(body.confirmation_version).toBe(version);
    expect('covenant_authority_confirmed' in body).toBe(version==='seller-listing-confirmation-v3');
    expect(body.license_selection.seller_acceptance.authority_confirmed).toBe(true);
  });
});
