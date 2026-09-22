// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useState} from 'react';
import SellerLicenseSelection,{CUSTOM_NOTICE} from './SellerLicenseSelection';
import {createStandardSelection,type LicenseSelection} from '@/api/listingLicenses';
import uploadResponse from '@/api/fixtures/s1735-custom-upload.json';

const transport = vi.hoisted(()=>({post:vi.fn()}));
vi.mock('@/api/client',()=>({api:transport}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});

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

  it('uploads a custom document, shows the exact amber notice, and sends explicit training choice',async()=>{
    vi.stubGlobal('URL',{...URL,createObjectURL:vi.fn(()=> 'blob:uploaded-licence'),revokeObjectURL:vi.fn()});
    transport.post.mockResolvedValue({data:uploadResponse});
    render(<Harness/>);
    fireEvent.click(screen.getByRole('radio',{name:/My own licence/}));
    expect(screen.getAllByText(CUSTOM_NOTICE)).toHaveLength(2);
    const file=new File(['plain English terms'], 'terms.txt',{type:'text/plain'});
    fireEvent.change(screen.getByLabelText('Upload your licence'),{target:{files:[file]}});
    await screen.findByText('Custom licence uploaded and verified.');
    expect(transport.post).toHaveBeenCalledWith('/licenses/custom',expect.any(FormData));
    const body=transport.post.mock.calls[0][1] as FormData;
    expect(body.get('upload')).toBe(file);expect(body.get('title')).toBe('terms.txt');expect(body.get('ai_training')).toBe('true');
    await waitFor(()=>expect(JSON.parse(screen.getByTestId('wire').textContent!)).toEqual(expect.objectContaining({kind:'custom',version:'1.0',ai_training:true,license_document_id:'11111111-1111-4111-8111-111111111111',license_sha256:'1'.repeat(64),rider_sha256:'f9785144dc4d48af6446512cbabd03431a35015d71b92260f4dcfab164084140',covenant_sha256:'a91234b67bf7467a0c80f6e1caa47b563032e94751146901b796eaaf220431af'})));
    expect(screen.getByRole('link',{name:'Open AI-Training Rider'}).getAttribute('href')).toBe('/licenses/ai-training-rider/1.0/permitted?download=1');
    expect(screen.getByRole('link',{name:'Open full licence'}).getAttribute('href')).toBe('blob:uploaded-licence');
    expect(screen.queryByRole('link',{name:/custom\/11111111/})).toBeNull();
  });
});
