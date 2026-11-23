// @vitest-environment jsdom
import {createHash,webcrypto} from 'node:crypto';
import {cleanup,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {api} from '@/api/client';
import {nativeClient} from '@/api/connector-seller-settings';
import {LISTING_CONFIRMATION_V4,readListingReview} from '@/api/sellerListingReview';
import reviewFixture from '@/api/fixtures/s1735-v3-review.json';
import {useAuthStore} from '@/store/auth';
import {hash,instrument} from '@/tests/fixtures/seller-authority';
import SellerApproval from './SellerApproval';

afterEach(()=>{
  cleanup();
  useAuthStore.setState({token:null});
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([true,false])('shows matching Review and Prepare confirmations after reload (saved time: %s)',async(hasTime)=>{
  vi.stubGlobal('crypto',webcrypto);
  useAuthStore.setState({token:'session'});
  const confirmedAt='2026-11-23T10:00:00.000Z';
  const signedAt='2026-11-23T11:00:00.000Z';
  const renderedHtml='<p>Saved listing</p>';
  const renderHash=createHash('sha256').update(renderedHtml).digest('hex');
  const row=instrument();
  const reviewWire={...reviewFixture,draft_id:row.binding.draft_id,draft_version:row.binding.draft_version,
    presentation_version:'seller-listing-review-v4',rendered_html:renderedHtml,render_hash:renderHash,
    confirmation_version:LISTING_CONFIRMATION_V4,license_selection:row.license_selection,approval_available:true,
    source_hash:hash,source_page:{review_hash:reviewFixture.review_hash,source_hash:hash,source_version:reviewFixture.source_version,
      offset:0,page_size:50,total_count:1,total_size_bytes:1,next_cursor:null,
      files:[{key:'data.csv',size:1,etag:'etag',version_id:null}]},
    ...(hasTime?{covenant_confirmed_at:confirmedAt}:{}),
    approval:{id:row.binding.approval_id,draft_version:row.binding.draft_version,review_hash:reviewFixture.review_hash,
      render_hash:renderHash,source_version:reviewFixture.source_version,sample_decision:'none',license_selection:row.license_selection}};
  const read=vi.spyOn(api,'get').mockImplementation(async path=>({data:path==='/seller-workspace/listing-review'
    ? structuredClone(reviewWire) : {publication_available:false,publication:null}}));
  vi.spyOn(nativeClient,'get').mockResolvedValue({data:{...row,status:'signed',signed_coverage_hash:hash,
    signed_at:signedAt,binding:{...row.binding,render_hash:renderHash}}});

  async function openSavedReview() {
    const review=await readListingReview(new AbortController().signal,row.binding.draft_id);
    const view=render(<SellerApproval review={review} active rendered/>);
    await screen.findByText('Ready to publish');
    return view;
  }

  const first=await openSavedReview();
  first.unmount();
  await openSavedReview();
  const label=/^Covenant and authority confirmed at the licence step/;
  const prepare=within(screen.getByRole('region',{name:'Listing preparation'})).getByText(label);
  const lines=screen.getAllByText(label);
  expect(lines).toHaveLength(2);
  const review=lines.find(line=>line!==prepare)!;
  expect(review.textContent).toBe(prepare.textContent);
  if(hasTime) {
    expect(review.querySelector('time')?.dateTime).toBe(confirmedAt);
    expect(prepare.querySelector('time')?.dateTime).toBe(confirmedAt);
  } else {
    expect(prepare.textContent).toBe('Covenant and authority confirmed at the licence step.');
    expect(review.querySelector('time')).toBeNull();
    expect(prepare.querySelector('time')).toBeNull();
  }
  expect(read.mock.calls.filter(([path])=>path==='/seller-workspace/listing-review')).toHaveLength(2);
});
