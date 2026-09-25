// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useState} from 'react';
import {webcrypto} from 'node:crypto';
import SellerLicenseSelection,{CUSTOM_NOTICE} from './SellerLicenseSelection';
import {createStandardSelection,type LicenseSelection} from '@/api/listingLicenses';
import {hashLicenseComponentBytes,sha256} from '@/lib/customLicenseVerification';

const transport = vi.hoisted(()=>({post:vi.fn()}));
vi.mock('@/api/client',()=>({api:transport}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});

async function responseFor(text:string,title='Terms') {
  const bytes=new TextEncoder().encode(text);
  const source_sha256=await sha256(bytes);
  return {id:'11111111-1111-4111-8111-111111111111',title,text,content_type:'text/plain',size_bytes:bytes.length,source_sha256,
    license_sha256:await hashLicenseComponentBytes(bytes,{kind:'license',code:'custom',version:'1',params:{ai_training:true,source_sha256}}),status:'active'};
}

function Harness({initial=createStandardSelection()}:{initial?:LicenseSelection}) {
  const [value,setValue]=useState(initial);
  return <><SellerLicenseSelection value={value} onChange={setValue}/><output data-testid="wire">{JSON.stringify(value)}</output></>;
}

describe('Seller licence selection',()=>{
  it('shows exactly two cards, defaults training to Allow, and emits the exact section 9 wire shape',()=>{
    render(<Harness/>);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect((screen.getByRole('radio',{name:/Standard/}) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Allow AI/ML training') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Allow')).toBeTruthy();
    const wire=JSON.parse(screen.getByTestId('wire').textContent!);
    expect(wire).toEqual({
      kind:'standard',version:'1.0',ai_training:true,license_document_id:null,
      license_sha256:'4b05dbcd0c186746d3deab6c68beaebba88610de8e85122efb4d527edb1263c6',rider_sha256:null,
      covenant_code:'marketplace-listing',covenant_version:'1.0',covenant_sha256:'a91234b67bf7467a0c80f6e1caa47b563032e94751146901b796eaaf220431af',
      seller_acceptance:{signer_name:'',signer_title:'',authority_confirmed:false},
    });
  });

  it('keeps covenant confirmation disabled until the terms are opened',()=>{
    render(<Harness/>);
    const confirmation=screen.getByLabelText('Confirm covenant and authority') as HTMLInputElement;
    expect(confirmation.disabled).toBe(true);
    const details=screen.getByText('Read the summary and full terms').closest('details')!;
    Object.defineProperty(details,'open',{value:true,configurable:true});
    fireEvent(details,new Event('toggle'));
    expect(confirmation.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Signer full name'),{target:{value:'Sam Seller'}});
    fireEvent.change(screen.getByLabelText('Signer title'),{target:{value:'Director'}});
    fireEvent.click(confirmation);
    expect(JSON.parse(screen.getByTestId('wire').textContent!).seller_acceptance).toEqual({signer_name:'Sam Seller',signer_title:'Director',authority_confirmed:true});
    fireEvent.click(screen.getByLabelText('Allow AI/ML training'));
    expect(JSON.parse(screen.getByTestId('wire').textContent!).seller_acceptance.authority_confirmed).toBe(false);
    expect(confirmation.disabled).toBe(true);
  });

  it('submits pasted text, previews verified server text and resets stale approval on edits',async()=>{
    vi.stubGlobal('crypto',webcrypto);
    const submitted='A  \nB';
    const canonical='A\nB\n';
    const response=await responseFor(canonical);
    transport.post.mockResolvedValue({data:response});
    render(<Harness/>);
    fireEvent.click(screen.getByRole('radio',{name:/My own licence/}));
    expect(screen.getAllByText(CUSTOM_NOTICE)).toHaveLength(2);
    expect(screen.queryByLabelText('Upload your licence')).toBeNull();
    expect(document.querySelector('input[type=file]')).toBeNull();
    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Terms'}});
    fireEvent.change(screen.getByLabelText('Your licence text'),{target:{value:submitted}});
    expect(screen.getByText(/5 \/ 65,536 Unicode characters/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
    await screen.findByText('Custom licence text saved and verified.');
    expect(transport.post).toHaveBeenCalledWith('/licenses/custom',{title:'Terms',ai_training:true,text:submitted},expect.anything());
    await waitFor(()=>expect(JSON.parse(screen.getByTestId('wire').textContent!)).toEqual(expect.objectContaining({kind:'custom',version:'1.0',ai_training:true,license_document_id:response.id,license_sha256:response.license_sha256,rider_sha256:'f9785144dc4d48af6446512cbabd03431a35015d71b92260f4dcfab164084140'})));
    expect(screen.getByLabelText('Verified custom licence preview').textContent).toContain(canonical);
    expect(screen.getByRole('link',{name:'Open AI-Training Rider'}).getAttribute('href')).toBe('/licenses/ai-training-rider/1.0/permitted?download=1');
    const details=screen.getByText('Read the summary and full terms').closest('details')!;
    Object.defineProperty(details,'open',{value:true,configurable:true});
    fireEvent(details,new Event('toggle'));
    fireEvent.change(screen.getByLabelText('Signer full name'),{target:{value:'Sam Seller'}});
    fireEvent.change(screen.getByLabelText('Signer title'),{target:{value:'Director'}});
    fireEvent.click(screen.getByLabelText('Confirm covenant and authority'));
    expect(JSON.parse(screen.getByTestId('wire').textContent!).seller_acceptance.authority_confirmed).toBe(true);
    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Other Terms'}});
    expect(JSON.parse(screen.getByTestId('wire').textContent!).license_document_id).toBeNull();
    expect(JSON.parse(screen.getByTestId('wire').textContent!).seller_acceptance.authority_confirmed).toBe(false);
    expect(screen.queryByLabelText('Verified custom licence preview')).toBeNull();
  });

  it('shows the verified title after a same-session title-only 422 refusal',async()=>{
    vi.stubGlobal('crypto',webcrypto);
    const text='The same licence terms.\n';
    transport.post.mockResolvedValueOnce({data:await responseFor(text,'Original Terms')});
    render(<Harness/>);
    fireEvent.click(screen.getByRole('radio',{name:/My own licence/}));
    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Original Terms'}});
    fireEvent.change(screen.getByLabelText('Your licence text'),{target:{value:text}});
    fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
    await screen.findByText('Custom licence text saved and verified.');

    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Renamed Terms'}});
    transport.post.mockRejectedValueOnce({response:{status:422,data:{detail:{code:'LICENSE_DOCUMENT_INVALID'}}}});
    fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
    expect((await screen.findByRole('alert')).textContent).toContain('The stored title is “Original Terms”');
    expect(transport.post).toHaveBeenLastCalledWith('/licenses/custom',{title:'Renamed Terms',ai_training:true,text},expect.anything());
  });

  it('shows a title-only 422 refusal without guessing a title on a fresh visit',async()=>{
    render(<Harness/>);
    fireEvent.click(screen.getByRole('radio',{name:/My own licence/}));
    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Proposed Terms'}});
    fireEvent.change(screen.getByLabelText('Your licence text'),{target:{value:'The same licence terms.\n'}});
    transport.post.mockRejectedValueOnce({response:{status:422,data:{detail:{code:'LICENSE_DOCUMENT_INVALID'}}}});
    fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
    const refusal=(await screen.findByRole('alert')).textContent;
    expect(refusal).toBe('The licence was refused. Check the title and characters.');
    expect(refusal).not.toContain('stored title');
  });

  it('keeps literal markup out of the DOM and resets after text or training changes',async()=>{
    vi.stubGlobal('crypto',webcrypto);
    const text='<script>alert(1)</script> **bold**\n\tCafé\n';
    transport.post.mockResolvedValue({data:await responseFor(text)});
    render(<Harness/>);
    fireEvent.click(screen.getByRole('radio',{name:/My own licence/}));
    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Terms'}});
    fireEvent.change(screen.getByLabelText('Your licence text'),{target:{value:text}});
    fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
    await screen.findByLabelText('Verified custom licence preview');
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByLabelText('Verified custom licence preview').textContent).toContain(text);
    fireEvent.change(screen.getByLabelText('Your licence text'),{target:{value:text+'More'}});
    expect(JSON.parse(screen.getByTestId('wire').textContent!).license_sha256).toBe('');
    expect(screen.queryByLabelText('Verified custom licence preview')).toBeNull();
    fireEvent.click(screen.getByLabelText('Allow AI/ML training'));
    expect(JSON.parse(screen.getByTestId('wire').textContent!).ai_training).toBe(false);
  });
});
