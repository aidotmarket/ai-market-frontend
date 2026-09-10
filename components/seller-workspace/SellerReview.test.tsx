// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SellerReview from './SellerReview';
const api = vi.hoisted(() => ({readListingReview:vi.fn(),readReviewSourcePage:vi.fn()}));
vi.mock('@/api/sellerListingReview', () => api);
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
