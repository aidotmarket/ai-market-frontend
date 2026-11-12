// @vitest-environment jsdom
import {webcrypto} from 'node:crypto';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import SellerReview from './SellerReview';
import savedWire from '@/tests/fixtures/s1922-saved-review-wire.json';
import publicWire from '@/tests/fixtures/s1922-backend-wire.json';
const transport=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('@/api/client',()=>({api:transport}));
vi.mock('./GuidedListingFlow',()=>({useListingFlow:()=>null,StepNext:()=>null}));
// Publication is a separate operation: inspect the real restored approval at
// that boundary without starting preparation/status requests from its child.
vi.mock('./SellerPublication',()=>({default:({approval}:{approval:{id:string;render_hash:string}})=><output aria-label="Restored original approval">{approval.id}:{approval.render_hash}</output>}));
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('crypto',webcrypto);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it.each(savedWire.fixtures)('renders actual saved original $name through the production reader and restores approval',async fixture=>{
 transport.get.mockResolvedValueOnce({data:structuredClone(fixture.review)}).mockResolvedValueOnce({data:fixture.next_page});
 render(<SellerReview active enabled/>);
 const frame=await screen.findByTitle('Saved original seller review');
 expect(frame.getAttribute('srcdoc')).toBe(fixture.review.rendered_html);
 expect(frame.getAttribute('sandbox')).toBe('');
 expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
 expect(screen.getByLabelText('Restored original approval').textContent).toBe(`${fixture.review.approval.id}:${fixture.review.render_hash}`);
 expect(screen.getByText('Review approved and saved.')).toBeTruthy();
 expect(screen.getByText('synthetic/source-0.csv')).toBeTruthy();
 expect(frame.getAttribute('srcdoc')).not.toContain('synthetic/source-0.csv');
 fireEvent.click(screen.getByRole('button',{name:'Next review files'}));
 expect(await screen.findByText('synthetic/source-2.csv')).toBeTruthy();
 expect(screen.queryByText('synthetic/source-0.csv')).toBeNull();
 expect(transport.get).toHaveBeenLastCalledWith('/seller-workspace/listing-review/files',{
  params:{cursor:fixture.review.source_page.next_cursor,draft_id:fixture.review.draft_id},signal:expect.any(AbortSignal)});
 expect(transport.post).not.toHaveBeenCalled();
});

it('installs no original iframe or approval for a corrected or unknown saved-review variant',async()=>{
 for(const marker of [{...publicWire.public[2].corrected},{presentation_kind:'unknown-correction'}]){
  transport.get.mockResolvedValueOnce({data:{...savedWire.fixtures[0].review,...marker}});
  const view=render(<SellerReview active enabled/>);
  await screen.findByRole('alert');
  expect(screen.queryByTitle('Saved original seller review')).toBeNull();
  expect(screen.queryByLabelText('Restored original approval')).toBeNull();
  view.unmount();
 }
 expect(transport.post).not.toHaveBeenCalled();
});
