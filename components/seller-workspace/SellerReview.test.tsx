// @vitest-environment jsdom
import {useState} from 'react';
import { cleanup, fireEvent, render, screen,waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SellerReview from './SellerReview';
import {SellerListingDraftProvider,useSellerListingDraft} from './SellerListingDraftStore';
const api = vi.hoisted(() => ({readListingReview:vi.fn(),readReviewSourcePage:vi.fn()}));
const drafts=vi.hoisted(()=>({readListingDraft:vi.fn(),saveListingDraft:vi.fn()}));
vi.mock('@/api/sellerListingReview', () => api);
vi.mock('@/api/sellerListingDraft',()=>drafts);
afterEach(() => {cleanup();vi.resetAllMocks();});
it('displays saved fields without exposing an approval or publication action', async () => {
  const html = '<!doctype html><html><body><h1>Saved retail offer</h1><p>$25.00</p></body></html>';
  api.readListingReview.mockResolvedValue({rendered_html:html,fields:{title:'Saved retail offer', description:'Weekly totals', category:'Retail',tags:'retail',price:'25.00',license:'Research'},source_page:{files:[{key:'private/retail.csv',size:42,etag:'synthetic',version_id:null}],total_count:1,total_size_bytes:42,offset:0,next_cursor:null},missing_fields:[],approval_available:false});
  render(<SellerReview active enabled />);
  const frame = await screen.findByTitle('Saved listing buyers would see');
  expect(frame.getAttribute('srcdoc')).toBe(html);
  expect(screen.getByText('private/retail.csv')).toBeTruthy();
  expect(frame.getAttribute('srcdoc')).not.toContain('private/retail.csv');
  expect(frame.getAttribute('sandbox')).toBe('');
  expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(screen.getByText(/This review uses your saved listing fields/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:/approve|publish/i})).toBeNull();
});
it('does not request a review before the capability is available', () => {
  render(<SellerReview active enabled={false} />);
  expect(api.readListingReview).not.toHaveBeenCalled();
});
function PendingReviewHarness(){
 const {loaded,saveSamples}=useSellerListingDraft();const [active,setActive]=useState(false);
 return <><button disabled={!loaded} onClick={()=>void saveSamples([0])}>Start sample save</button><button onClick={()=>setActive(true)}>Open review</button><SellerReview active={active} enabled/></>;
}
it('disables review while a sample selection save is pending',async()=>{
 drafts.readListingDraft.mockResolvedValue({version:1,content:{brief:'',title:'',description:'',category:'',tags:'',price:'',license:''}});
 drafts.saveListingDraft.mockReturnValue(new Promise(()=>{}));
 render(<SellerListingDraftProvider enabled sampleCapability><PendingReviewHarness/></SellerListingDraftProvider>);
 await waitFor(()=>expect((screen.getByRole('button',{name:'Start sample save'}) as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Start sample save'}));fireEvent.click(screen.getByRole('button',{name:'Open review'}));
 expect(await screen.findByText(/Review is disabled while/)).toBeTruthy();
 expect((screen.getByRole('button',{name:'Refresh saved review'}) as HTMLButtonElement).disabled).toBe(true);
 expect(api.readListingReview).not.toHaveBeenCalled();
});

it('shows the v2 sample statement with basename, size and index',async()=>{
 const html='<p>Sampled offer</p>';
 api.readListingReview.mockResolvedValue({rendered_html:html,render_hash:'a'.repeat(64),review_hash:'b'.repeat(64),source_hash:'c'.repeat(64),source_version:2,
  fields:{title:'Sampled',description:'Description',category:'Retail',tags:'retail',price:'25',license:'Research'},draft_version:2,presentation_version:'seller-listing-review-v2',
  source_page:null,missing_fields:[],approval_available:false,sample_decision:'member_files',sample_object_indices:[4],confirmation_version:'seller-listing-confirmation-v2',
  confirmation_statements:{sample_files_confirmed:'Uploaded samples are free copies.'},sample_status:{state:'selected',files:[{index:4,key_basename:'sample.csv',size:2048,sha256:'d'.repeat(64)}]}});
 render(<SellerReview active enabled/>);
 expect(await screen.findByText('Uploaded samples are free copies.')).toBeTruthy();
 expect(screen.getByText('sample.csv')).toBeTruthy();expect(screen.getByText('2,048 bytes · index 4')).toBeTruthy();
});
it('keeps v1 review markup unchanged when explicit none fields arrive',async()=>{
 const value={rendered_html:'<p>Legacy</p>',fields:{},source_page:null,missing_fields:[],approval_available:false};
 api.readListingReview.mockResolvedValue(value);const first=render(<SellerReview active enabled/>);
 await screen.findByTitle('Saved listing buyers would see');const legacy=first.container.innerHTML;first.unmount();
 api.readListingReview.mockResolvedValue({...value,sample_decision:'none',sample_object_indices:[],sample_status:'not_selected'});
 const second=render(<SellerReview active enabled/>);await screen.findByTitle('Saved listing buyers would see');
 expect(second.container.innerHTML).toBe(legacy);
});


const files=(offset:number)=>Array.from({length:50},(_,i)=>({key:`private/${i+offset}.csv`,size:1024,etag:'e',version_id:null}));
const first={files:files(0),review_hash:'review',source_hash:'source',source_version:1,offset:0,page_size:50,total_count:22000,total_size_bytes:22528000,next_cursor:'next'};
const prepared={rendered_html:'<p>Synthetic offer</p>',render_hash:'hash',review_hash:'review',source_hash:'source',source_version:1,source_page:first,missing_fields:[],approval_available:false};
it('loads bounded server pages while retaining the complete 22,000-file totals',async()=>{
 api.readListingReview.mockResolvedValue(prepared);
 api.readReviewSourcePage.mockResolvedValue({...first,files:files(50),offset:50,next_cursor:'third'});
 render(<SellerReview active enabled/>);
 await screen.findByText('22,000 files · 22,528,000 bytes');
 expect(screen.getAllByRole('listitem')).toHaveLength(50);
 expect(screen.queryByText('private/50.csv')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Next review files'}));
 await screen.findByText('private/50.csv');
 expect(api.readReviewSourcePage).toHaveBeenCalledWith(prepared,'next',50,expect.any(AbortSignal));
 expect(screen.queryByText('private/0.csv')).toBeNull();
 expect(screen.getAllByRole('listitem')).toHaveLength(50);
 fireEvent.click(screen.getByRole('button',{name:'Previous review files'}));
 await screen.findByText('private/0.csv');
 expect(api.readListingReview).toHaveBeenCalledTimes(2);
});
it('hides files and stops paging after a stale or failed page',async()=>{
 api.readListingReview.mockResolvedValue(prepared);
 api.readReviewSourcePage.mockRejectedValue(new Error('failed'));
 render(<SellerReview active enabled/>);
 await screen.findByText('private/0.csv');
 fireEvent.click(screen.getByRole('button',{name:'Next review files'}));
 await screen.findByRole('alert');
 expect(screen.queryByRole('listitem')).toBeNull();
 expect((screen.getByRole('button',{name:'Next review files'}) as HTMLButtonElement).disabled).toBe(true);
});
it('aborts pending file navigation when the review closes',async()=>{
 let resolve:(value:unknown)=>void=()=>{};
 api.readListingReview.mockResolvedValue(prepared);
 api.readReviewSourcePage.mockReturnValue(new Promise(done=>{resolve=done;}));
 const view=render(<SellerReview active enabled/>);
 await screen.findByText('private/0.csv');
 fireEvent.click(screen.getByRole('button',{name:'Next review files'}));
 const signal=api.readReviewSourcePage.mock.calls[0][3];
 view.rerender(<SellerReview active={false} enabled/>);
 expect(signal.aborted).toBe(true);
 resolve({...first,files:files(50),offset:50});
 expect(screen.queryByText('private/50.csv')).toBeNull();
});
