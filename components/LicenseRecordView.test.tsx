// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import record from '@/tests/fixtures/s1735_license_record.json';
import LicenseRecordView from './LicenseRecordView';

const records=vi.hoisted(()=>({getLicenseRecord:vi.fn(),downloadLicenseRecordPdf:vi.fn(),confirmLicenseRecordDeletion:vi.fn()}));
vi.mock('@/api/licenseRecords',()=>records);
vi.mock('next/navigation',()=>({useParams:()=>({id:'order-1'})}));
vi.mock('next/link',()=>({default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});

it.each(['buyer','seller'] as const)('renders frozen custom text literally for %s and keeps record PDF action',async party=>{
  const text='<script>alert(1)</script> **bold**\n\tCafé\n';
  records.getLicenseRecord.mockResolvedValue({...record,
    license:{...record.license,code:'custom',version:'1',text},
    buyer:party==='buyer'?record.buyer:{reference:'buyer-ref',role:'buyer'},
    seller:party==='seller'?{legal_name:'Seller Ltd',jurisdiction:'GB',party_type:'company'}:record.seller,
  });
  records.downloadLicenseRecordPdf.mockResolvedValue(new Blob(['%PDF-1.4'],{type:'application/pdf'}));
  vi.stubGlobal('URL',{...URL,createObjectURL:vi.fn(()=> 'blob:record'),revokeObjectURL:vi.fn()});
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  render(<LicenseRecordView party={party}/>);
  const disclosure=(await screen.findAllByText('Read exact recorded text'))[0];
  const pre=disclosure.closest('details')!.querySelector('pre')!;
  expect(pre.textContent).toBe(text);
  expect(pre.getAttribute('dir')).toBe('auto');
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByText(party==='buyer'?'Buyer Ltd (GB)':'Seller Ltd (GB)')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Download PDF'}));
  expect(records.downloadLicenseRecordPdf).toHaveBeenCalledWith('order-1');
});
