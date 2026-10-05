// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useState} from 'react';
import {webcrypto} from 'node:crypto';
import SellerLicenseSelection,{CUSTOM_NOTICE} from './SellerLicenseSelection';
import {createStandardSelection,type LicenseSelection} from '@/api/listingLicenses';
import {hashLicenseComponentBytes,sha256} from '@/lib/customLicenseVerification';

const transport = vi.hoisted(()=>({post:vi.fn(),get:vi.fn().mockResolvedValue({data:{full_text:'The full terms'}})}));
vi.mock('@/api/client',()=>({api:transport}));
const legal=vi.hoisted(()=>({getSellerLegalIdentity:vi.fn(),refreshSellerLegalIdentity:vi.fn(),saveSellerLegalIdentity:vi.fn()}));
vi.mock('@/api/sellerLegalIdentity',async(importOriginal)=>({...await importOriginal<typeof import('@/api/sellerLegalIdentity')>(),...legal}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
beforeEach(()=>{vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:licence'),revokeObjectURL:vi.fn()}));legal.refreshSellerLegalIdentity.mockResolvedValue({status:'known',source:'stripe_connect',legal_name:'Seller Ltd',jurisdiction:'GB',version:1});legal.getSellerLegalIdentity.mockResolvedValue({status:'known',source:'stripe_connect',legal_name:'Seller Ltd',jurisdiction:'GB',version:1});});

async function responseFor(text:string,title='Terms') {
  const bytes=new TextEncoder().encode(text);
  const source_sha256=await sha256(bytes);
  return {id:'11111111-1111-4111-8111-111111111111',title,text,content_type:'text/plain',size_bytes:bytes.length,source_sha256,
    license_sha256:await hashLicenseComponentBytes(bytes,{kind:'license',code:'custom',version:'1',params:{ai_training:true,source_sha256}}),status:'active'};
}

function Harness({initial=createStandardSelection()}:{initial?:LicenseSelection}) {
  const [value,setValue]=useState(initial);
  return <><SellerLicenseSelection value={value} onChange={setValue} legalIdentityEnabled/><output data-testid="wire">{JSON.stringify(value)}</output></>;
}

function readTerms(label='Read licence'){
 fireEvent.click(screen.getByRole(label==='Read licence'?'link':'button',{name:label}));fireEvent.keyDown(document,{key:'Escape'});
}
function openBoth(){readTerms();readTerms('Read Marketplace Listing Covenant');}

describe('Seller licence selection',()=>{
  it('checks refresh before GET and shows a Stripe legal name without a save button',async()=>{
    const order:string[]=[];
    legal.refreshSellerLegalIdentity.mockImplementation(async()=>{order.push('refresh');});
    legal.getSellerLegalIdentity.mockImplementation(async()=>{order.push('get');return {status:'known',source:'stripe_connect',legal_name:'Seller Ltd',jurisdiction:'GB',version:4};});
    render(<Harness/>);
    expect(screen.getByText('Checking your legal details…')).toBeTruthy();
    await screen.findByText('Legal name on the licence: Seller Ltd (GB)');
    expect(order).toEqual(['refresh','get']);
    expect(screen.getByText('from your Stripe account')).toBeTruthy();
    expect(screen.queryByRole('button',{name:'Save legal details'})).toBeNull();
    expect(JSON.parse(screen.getByTestId('wire').textContent!).identity_version).toBe(4);
  });
  it('saves required legal name and country separately from signer fields',async()=>{
    const required={status:'required',source:null,legal_name:null,jurisdiction:null,version:null};
    const typed={status:'known',source:'seller_typed',legal_name:'Taylor Seller',jurisdiction:'US',version:1};
    legal.getSellerLegalIdentity.mockResolvedValueOnce(required).mockResolvedValueOnce(typed);
    legal.saveSellerLegalIdentity.mockResolvedValue(typed);
    render(<Harness/>);
    await screen.findByText(/Your legal name and country are not saved/);
    fireEvent.change(screen.getByLabelText('Legal name'),{target:{value:'Taylor Seller'}});
    fireEvent.change(screen.getByLabelText('Country'),{target:{value:'US'}});
    fireEvent.click(screen.getByRole('button',{name:'Save legal details'}));
    await screen.findByText('Legal name on the licence: Taylor Seller (US)');
    expect(legal.saveSellerLegalIdentity).toHaveBeenCalledWith('Taylor Seller','US',0);
    expect(JSON.parse(screen.getByTestId('wire').textContent!).seller_acceptance.signer_name).toBe('');
    expect(JSON.parse(screen.getByTestId('wire').textContent!).identity_version).toBe(1);
    expect(screen.queryByRole('button',{name:'Save legal details'})).toBeNull();
  });
  it('allows a seller typed correction until the server refuses it with a reason',async()=>{
    legal.getSellerLegalIdentity.mockResolvedValue({status:'known',source:'seller_typed',legal_name:'Old Name',jurisdiction:'GB',version:2,seller_editable:true});
    legal.saveSellerLegalIdentity.mockRejectedValue({response:{status:409,data:{detail:{code:'SELLER_LEGAL_IDENTITY_REQUIRED'}}}});
    render(<Harness/>);
    await screen.findByText('saved by you');
    fireEvent.click(screen.getByRole('button',{name:'Edit legal details'}));
    expect(screen.queryByRole('button',{name:'Save legal details'})).toBeNull();
    fireEvent.change(screen.getByLabelText('Legal name'),{target:{value:'New Name'}});
    fireEvent.click(screen.getByRole('button',{name:'Save legal details'}));
    expect((await screen.findByText(/Check them and try again/)).textContent).toContain('not saved');
    expect(legal.saveSellerLegalIdentity).toHaveBeenCalledWith('New Name','GB',2);
  });
  it('shows a field error for invalid legal identity',async()=>{
    legal.getSellerLegalIdentity.mockResolvedValue({status:'required',source:null,legal_name:null,jurisdiction:null,version:null});
    legal.saveSellerLegalIdentity.mockRejectedValue({response:{status:422,data:{detail:{code:'LEGAL_IDENTITY_INVALID'}}}});
    render(<Harness/>);
    await screen.findByText(/Your legal name and country are not saved/);
    fireEvent.change(screen.getByLabelText('Legal name'),{target:{value:'Taylor Seller'}});
    fireEvent.change(screen.getByLabelText('Country'),{target:{value:'US'}});
    fireEvent.click(screen.getByRole('button',{name:'Save legal details'}));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent','Check the legal name and country');
  });
  it('shows the safe server reason when a typed correction is locked',async()=>{
    legal.getSellerLegalIdentity.mockResolvedValue({status:'known',source:'seller_typed',legal_name:'Old Name',jurisdiction:'GB',version:2,seller_editable:true});
    legal.saveSellerLegalIdentity.mockRejectedValue({response:{status:409,data:{detail:{code:'IDENTITY_ALREADY_ACCEPTED',message:'This legal identity is already used in an accepted licence.'}}}});
    render(<Harness/>);
    await screen.findByText('saved by you');
    fireEvent.click(screen.getByRole('button',{name:'Edit legal details'}));
    fireEvent.change(screen.getByLabelText('Legal name'),{target:{value:'New Name'}});
    fireEvent.click(screen.getByRole('button',{name:'Save legal details'}));
    expect(await screen.findByText('This legal identity is already used in an accepted licence.')).toBeTruthy();
  });
  it.each([undefined,false])('hides legal edit when seller_editable is %s',async seller_editable=>{
    legal.getSellerLegalIdentity.mockResolvedValue({status:'known',source:'seller_typed',legal_name:'Reviewed Name',jurisdiction:'GB',version:3,seller_editable});
    render(<Harness/>);
    await screen.findByText('Legal name on the licence: Reviewed Name (GB)');
    expect(screen.queryByRole('button',{name:'Edit legal details'})).toBeNull();
    expect(screen.queryByLabelText('Legal name')).toBeNull();
    expect(screen.queryByRole('button',{name:'Save legal details'})).toBeNull();
  });
  it('hides names on conflict and links to the restricted support path',async()=>{
    legal.refreshSellerLegalIdentity.mockRejectedValue({response:{status:409,data:{detail:{code:'LEGAL_IDENTITY_CONFLICT',sources:['Secret Name']}}}});
    legal.getSellerLegalIdentity.mockRejectedValue({response:{status:409,data:{detail:{code:'LEGAL_IDENTITY_CONFLICT',sources:['Secret Name']}}}});
    render(<Harness/>);
    expect((await screen.findByRole('alert')).textContent).toContain('quick check by our support team');
    expect(document.body.textContent).not.toContain('Secret Name');
    expect(screen.getByRole('link',{name:'Contact support'}).getAttribute('href')).toBe('/seller-workspace/support/legal-identity');
  });
  it('offers Retry after a 503 and then accepts a known identity',async()=>{
    legal.refreshSellerLegalIdentity.mockRejectedValueOnce({response:{status:503,data:{detail:{code:'IDENTITY_SERVICE_UNAVAILABLE'}}}});
    legal.getSellerLegalIdentity.mockRejectedValueOnce({response:{status:503,data:{detail:{code:'IDENTITY_SERVICE_UNAVAILABLE'}}}});
    render(<Harness/>);
    await screen.findByText(/We could not check your legal details right now/);
    fireEvent.click(screen.getByRole('button',{name:'Retry'}));
    await screen.findByText('Legal name on the licence: Seller Ltd (GB)');
  });
  it('uses a saved identity if Stripe refresh is unavailable',async()=>{
    legal.refreshSellerLegalIdentity.mockRejectedValueOnce({response:{status:503,data:{detail:{code:'IDENTITY_SERVICE_UNAVAILABLE'}}}});
    render(<Harness/>);
    await screen.findByText('Legal name on the licence: Seller Ltd (GB)');
    expect(screen.getByText(/Your saved legal details are still available/)).toBeTruthy();
  });
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

  it('keeps covenant confirmation disabled until both terms are opened',()=>{
    render(<Harness/>);
    const confirmation=screen.getByLabelText('Confirm covenant and authority') as HTMLInputElement;
    expect(confirmation.disabled).toBe(true);
    expect(screen.getByText('Open the selected licence and Marketplace Listing Covenant first.')).toBeTruthy();
    fireEvent.click(confirmation.closest('label')!);
    expect(screen.getByRole('alert').textContent).toBe('Open the selected licence and Marketplace Listing Covenant first.');
    const details=screen.getByText('Read the summary and full terms').closest('details')!;
    Object.defineProperty(details,'open',{value:true,configurable:true});
    fireEvent(details,new Event('toggle'));
    expect(confirmation.disabled).toBe(true);
    openBoth();
    expect(confirmation.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Signer full name'),{target:{value:'Sam Seller'}});
    fireEvent.change(screen.getByLabelText('Signer title'),{target:{value:'Director'}});
    fireEvent.click(confirmation);
    expect(JSON.parse(screen.getByTestId('wire').textContent!).seller_acceptance).toEqual({signer_name:'Sam Seller',signer_title:'Director',authority_confirmed:true});
    fireEvent.click(screen.getByLabelText('Allow AI/ML training'));
    expect(JSON.parse(screen.getByTestId('wire').textContent!).seller_acceptance.authority_confirmed).toBe(false);
    expect(confirmation.disabled).toBe(true);
  });

  it('links to the current training variant and only records reading the selected Standard licence',async()=>{
    render(<Harness/>);
    await screen.findByText('Legal name on the licence: Seller Ltd (GB)');
    const link=screen.getByRole('link',{name:'Read licence'});
    expect(link.getAttribute('href')).toBe('/licenses/standard/1.0/ai-training');
    fireEvent.click(link);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByLabelText('Confirm covenant and authority') as HTMLInputElement).disabled).toBe(true);
    readTerms('Read Marketplace Listing Covenant');
    expect((screen.getByLabelText('Confirm covenant and authority') as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('Allow AI/ML training'));
    expect((screen.getByLabelText('Confirm covenant and authority') as HTMLInputElement).disabled).toBe(true);
    expect(link.getAttribute('href')).toBe('/licenses/standard/1.0/no-ai-training');
    fireEvent.click(link);
    expect((screen.getByLabelText('Confirm covenant and authority') as HTMLInputElement).disabled).toBe(false);
    expect(JSON.parse(screen.getByTestId('wire').textContent!).seller_acceptance.authority_confirmed).toBe(false);
  });

  it.each([
    ['required legal identity',true,true],['required legal identity',true,false],
    ['disabled while saving',false,true],['disabled while saving',false,false],
  ] as const)('keeps reading enabled with %s and training %s/%s',async(_reason,required,training)=>{
    if(required)legal.getSellerLegalIdentity.mockResolvedValue({status:'required',source:null,legal_name:null,jurisdiction:null,version:null});
    const value={...createStandardSelection(training),identity_version:required?undefined:1};
    const onChange=vi.fn();
    render(<SellerLicenseSelection value={value} onChange={onChange} disabled={!required} legalIdentityEnabled/>);
    if(required)await screen.findByText(/Your legal name and country are not saved/);
    else await screen.findByText('Legal name on the licence: Seller Ltd (GB)');
    const link=screen.getByRole('link',{name:'Read licence'}) as HTMLAnchorElement;
    const fieldset=link.closest('fieldset')!;
    expect(fieldset.disabled).toBe(true);
    expect(link.matches(':disabled')).toBe(false);
    expect(link.hasAttribute('aria-disabled')).toBe(false);
    expect(link.getAttribute('href')).toBe(`/licenses/standard/1.0/${training?'ai-training':'no-ai-training'}`);
    expect(link.search).toBe('');
    expect(link.hasAttribute('download')).toBe(false);
    expect(link.target).toBe('_blank');
    expect(link.rel.split(' ')).toContain('noopener');
    for(const control of fieldset.querySelectorAll('input,button,textarea,select'))expect(control.matches(':disabled')).toBe(true);
    const calls=[legal.getSellerLegalIdentity.mock.calls.length,legal.refreshSellerLegalIdentity.mock.calls.length];
    act(()=>link.click());
    expect((screen.getByRole('radio',{name:/Standard/}) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio',{name:/My own licence/}) as HTMLInputElement).checked).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(value.seller_acceptance.authority_confirmed).toBe(false);
    expect(legal.saveSellerLegalIdentity).not.toHaveBeenCalled();
    expect([legal.getSellerLegalIdentity.mock.calls.length,legal.refreshSellerLegalIdentity.mock.calls.length]).toEqual(calls);
    expect(transport.get).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([false,true])('does not select Standard or record it as read from a custom choice (disabled=%s)',disabled=>{
    const value={...createStandardSelection(false),kind:'custom' as const,license_document_id:null};
    const onChange=vi.fn();
    render(<SellerLicenseSelection value={value} onChange={onChange} disabled={disabled}/>);
    const link=screen.getByRole('link',{name:'Read licence'}) as HTMLAnchorElement;
    act(()=>link.click());
    expect(link.getAttribute('href')).toBe('/licenses/standard/1.0/no-ai-training');
    expect((screen.getByRole('radio',{name:/My own licence/}) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio',{name:/Standard/}) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Open the selected licence and Marketplace Listing Covenant first.')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect(transport.get).not.toHaveBeenCalled();
    expect(transport.post).not.toHaveBeenCalled();
    expect(legal.saveSellerLegalIdentity).not.toHaveBeenCalled();
  });

  it('keeps the Standard link usable during custom submission without selecting or resubmitting',async()=>{
    vi.stubGlobal('crypto',webcrypto);
    const response=await responseFor('The custom terms.\n');
    let finish!:(result:unknown)=>void;
    transport.post.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    render(<Harness/>);
    await screen.findByText('Legal name on the licence: Seller Ltd (GB)');
    fireEvent.click(screen.getByRole('radio',{name:/My own licence/}));
    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Terms'}});
    fireEvent.change(screen.getByLabelText('Your licence text'),{target:{value:'The custom terms.\n'}});
    fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
    expect(transport.post).toHaveBeenCalledOnce();
    const link=screen.getByRole('link',{name:'Read licence'}) as HTMLAnchorElement;
    const fieldset=link.closest('fieldset')!;
    expect(fieldset.disabled).toBe(true);
    expect(link.matches(':disabled')).toBe(false);
    for(const control of fieldset.querySelectorAll('input,button,textarea,select'))expect(control.matches(':disabled')).toBe(true);
    const wire=screen.getByTestId('wire').textContent;
    act(()=>link.click());
    expect(screen.getByTestId('wire').textContent).toBe(wire);
    expect(screen.getByText('Open the selected licence and Marketplace Listing Covenant first.')).toBeTruthy();
    expect(transport.post).toHaveBeenCalledOnce();
    expect(transport.get).not.toHaveBeenCalled();
    expect(legal.saveSellerLegalIdentity).not.toHaveBeenCalled();
    await act(async()=>{finish({status:201,data:response});});
    expect(await screen.findByText('Custom licence text saved and verified.')).toBeTruthy();
  });

  it('opens the details section to review both the standard licence and covenant',()=>{
    render(<Harness/>);
    const confirmation=screen.getByLabelText('Confirm covenant and authority') as HTMLInputElement;
    const details=screen.getByText('Read the summary and full terms').closest('details')!;
    Object.defineProperty(details,'open',{value:true,configurable:true});
    fireEvent(details,new Event('toggle'));
    expect(confirmation.disabled).toBe(true);
    openBoth();
    expect(confirmation.disabled).toBe(false);
    expect(screen.queryByText('Open the selected licence and Marketplace Listing Covenant first.')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Read full licence'}));
    expect(screen.getByRole('dialog',{name:'Read full licence'})).toBeTruthy();
    expect(screen.getByRole('link',{name:'Open in new tab'}).getAttribute('href')).toBe('/licenses/standard/1.0/ai-training');
  });

  it.each([
    ['A  \nB','A\nB\n'],
    ['Plain   terms\n\\*literal\\* &copy; &#x1F600; end.\n\tCafé 🦊  e\u0301','Plain   terms\n\\*literal\\* &copy; &#x1F600; end.\n\tCafé 🦊  é\n'],
  ])('submits pasted text, previews verified server text and resets stale approval on edits: %s',async(submitted,canonical)=>{
    vi.stubGlobal('crypto',webcrypto);
    const response=await responseFor(canonical);
    transport.post.mockResolvedValue({status:201,data:response});
    render(<Harness/>);
    fireEvent.click(screen.getByRole('radio',{name:/My own licence/}));
    expect(screen.getAllByText(CUSTOM_NOTICE)).toHaveLength(2);
    expect(screen.queryByLabelText('Upload your licence')).toBeNull();
    expect(document.querySelector('input[type=file]')).toBeNull();
    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Terms'}});
    fireEvent.change(screen.getByLabelText('Your licence text'),{target:{value:submitted}});
    expect(screen.getByLabelText('Live custom licence preview').textContent).toContain(submitted);
    fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
    await screen.findByText('Custom licence text saved and verified.');
    expect(screen.queryByRole('button',{name:'Save custom licence text'})).toBeNull();
    expect(transport.post).toHaveBeenCalledWith('/licenses/custom',{title:'Terms',ai_training:true,text:submitted},expect.anything());
    await waitFor(()=>expect(JSON.parse(screen.getByTestId('wire').textContent!)).toEqual(expect.objectContaining({kind:'custom',version:'1.0',ai_training:true,license_document_id:response.id,license_sha256:response.license_sha256,rider_sha256:'f9785144dc4d48af6446512cbabd03431a35015d71b92260f4dcfab164084140'})));
    expect(screen.getByLabelText('Verified custom licence preview').textContent).toContain(canonical);
    readTerms('Read AI-Training Rider');
    const details=screen.getByText('Read the summary and full terms').closest('details')!;
    Object.defineProperty(details,'open',{value:true,configurable:true});
    fireEvent(details,new Event('toggle'));
    fireEvent.click(screen.getByRole('button',{name:'Read full licence'}));
    expect(screen.getByRole('dialog').querySelector('.whitespace-pre-wrap')?.textContent).toBe(canonical);
    fireEvent.keyDown(document,{key:'Escape'});
    readTerms('Read Marketplace Listing Covenant');
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
    transport.post.mockResolvedValueOnce({status:201,data:await responseFor(text,'Original Terms')});
    render(<Harness/>);
    fireEvent.click(screen.getByRole('radio',{name:/My own licence/}));
    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Original Terms'}});
    fireEvent.change(screen.getByLabelText('Your licence text'),{target:{value:text}});
    fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
    await screen.findByText('Custom licence text saved and verified.');

    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Renamed Terms'}});
    transport.post.mockRejectedValueOnce({response:{status:422,data:{detail:{code:'LICENSE_DOCUMENT_INVALID'}}}});
    fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
    expect((await screen.findByRole('alert')).textContent).toContain('A previously verified submission used title “Original Terms”');
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

  it('remembers titles from earlier verified submissions in the same form session',async()=>{
    vi.stubGlobal('crypto',webcrypto);
    transport.post.mockResolvedValueOnce({status:201,data:await responseFor('First terms.\n','First Title')});
    transport.post.mockResolvedValueOnce({status:201,data:await responseFor('Second terms.\n','Second Title')});
    render(<Harness/>);
    fireEvent.click(screen.getByRole('radio',{name:/My own licence/}));
    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'First Title'}});
    fireEvent.change(screen.getByLabelText('Your licence text'),{target:{value:'First terms.\n'}});
    fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
    await screen.findByText('Custom licence text saved and verified.');
    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Second Title'}});
    fireEvent.change(screen.getByLabelText('Your licence text'),{target:{value:'Second terms.\n'}});
    fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
    await screen.findByText('Custom licence text saved and verified.');
    fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Renamed First'}});
    fireEvent.change(screen.getByLabelText('Your licence text'),{target:{value:'First terms.\n'}});
    transport.post.mockRejectedValueOnce({response:{status:422,data:{detail:{code:'LICENSE_DOCUMENT_INVALID'}}}});
    fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
    expect((await screen.findByRole('alert')).textContent).toContain('A previously verified submission used title “First Title”');
  });

  it('keeps literal markup out of the DOM and resets after text or training changes',async()=>{
    vi.stubGlobal('crypto',webcrypto);
    const text='<script>alert(1)</script> **bold**\n\tCafé\n';
    transport.post.mockResolvedValue({status:201,data:await responseFor(text)});
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


describe('custom Markdown editing',()=>{
 it('keeps exact edited source, toolbar selection, verified hashes and reading authority',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  render(<Harness/>);
  await screen.findByText('Legal name on the licence: Seller Ltd (GB)');
  fireEvent.click(screen.getByRole('radio',{name:/My own licence/}));
  fireEvent.change(screen.getByLabelText('Licence title'),{target:{value:'Terms'}});
  const input=screen.getByLabelText('Your licence text') as HTMLTextAreaElement;
  const entities='&copy; &#x1F600; &#x1D504; &#x4E2D; &#x202E; &#8238; &rlm;';
  const source='# Terms\n\nCafé 🦊  rights\t'+entities+' and *'+entities+'*\n';
  fireEvent.change(input,{target:{value:source}});
  input.setSelectionRange(source.indexOf('rights'),source.indexOf('rights')+6);
  fireEvent.click(screen.getByRole('button',{name:'Bold'}));
  const edited=source.replace('rights','**rights**');
  expect(input.value).toBe(edited);
  await waitFor(()=>expect(input.selectionStart).toBe(edited.indexOf('rights')));
  expect(input.selectionEnd).toBe(edited.indexOf('rights')+6);
  expect(screen.getByLabelText('Live custom licence preview').querySelector('strong')?.textContent).toBe('rights');
  expect(screen.getByLabelText('Live custom licence preview').querySelector('em')?.textContent).toBe(entities);
  expect((screen.getByLabelText('Confirm covenant and authority') as HTMLInputElement).disabled).toBe(true);
  const response=await responseFor(edited);
  transport.post.mockResolvedValue({status:201,data:response});
  fireEvent.click(screen.getByRole('button',{name:'Save custom licence text'}));
  await screen.findByText('Custom licence text saved and verified.');
  expect(transport.post).toHaveBeenCalledWith('/licenses/custom',{title:'Terms',ai_training:true,text:edited},expect.anything());
  expect(input.value).toBe(edited);
  expect(JSON.parse(screen.getByTestId('wire').textContent!).license_sha256).toBe(response.license_sha256);
  expect(screen.getByLabelText('Verified custom licence preview').querySelector('strong')?.textContent).toBe('rights');
  expect(screen.getByLabelText('Verified custom licence preview').querySelector('em')?.textContent).toBe(entities);
  expect(screen.getByLabelText('Verified custom licence preview').textContent).toContain('Café 🦊  rights\t'+entities);
  expect((screen.getByLabelText('Confirm covenant and authority') as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Read full licence'}));
  expect(screen.getByRole('dialog').querySelector('h1')?.textContent).toBe('Terms');
  expect(screen.getByRole('dialog').querySelector('em')?.textContent).toBe(entities);
  fireEvent.keyDown(document,{key:'Escape'});
  readTerms('Read Marketplace Listing Covenant');
  expect((screen.getByLabelText('Confirm covenant and authority') as HTMLInputElement).disabled).toBe(false);
  fireEvent.change(input,{target:{value:edited+'More'}});
  expect(JSON.parse(screen.getByTestId('wire').textContent!).license_sha256).toBe('');
  expect((screen.getByLabelText('Confirm covenant and authority') as HTMLInputElement).disabled).toBe(true);
 });
});
