// @vitest-environment jsdom
import {render,screen,cleanup,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import wire from '@/tests/fixtures/s1922-backend-wire.json';
import PurchasedLicenseDisplay from './PurchasedLicenseDisplay';
import {AxiosError} from 'axios';
const client=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('@/api/client',()=>({api:client}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('silently omits a missing deployment endpoint through the real API reader',async()=>{
 const f=wire.purchased[0];
 client.get.mockRejectedValue(new AxiosError('missing',undefined,undefined,undefined,{status:404} as never));
 const view=render(<PurchasedLicenseDisplay orderId={f.order_id} listingId={f.listing_id}/>);
 await waitFor(()=>expect(view.container.innerHTML).toBe(''));
 expect(client.get).toHaveBeenCalledTimes(1);
});
it.each([401,403,500])('retains the unavailable notice for HTTP %s',async status=>{
 const f=wire.purchased[0];
 client.get.mockRejectedValue(new AxiosError('error',undefined,undefined,undefined,{status} as never));
 render(<PurchasedLicenseDisplay orderId={f.order_id} listingId={f.listing_id}/>);
 await screen.findByText(/Purchased licence display is unavailable/);
 expect(screen.queryByTitle('Original seller evidence for purchased version')).toBeNull();
});
it.each(['private, max-age=900','public, no-store'])('keeps malformed/cacheable evidence visible as an error: %s',async policy=>{
 const f=wire.purchased[0];
 client.get.mockResolvedValue({data:f,headers:{'cache-control':policy}});
 render(<PurchasedLicenseDisplay orderId={f.order_id} listingId={f.listing_id}/>);
 await screen.findByText(/Purchased licence display is unavailable/);
 expect(screen.queryByTitle('Original seller evidence for purchased version')).toBeNull();
});
it.each(wire.purchased)('shows purchased $instrument_display.license_version separately from original seller evidence and current public display',async f=>{
 client.get.mockResolvedValue({data:f,headers:{'cache-control':'private, no-store'}});
 const before=JSON.stringify(f);
 render(<PurchasedLicenseDisplay orderId={f.order_id} listingId={f.listing_id}/>);
 await screen.findByRole('region',{name:'Purchased licence display'});
 expect(screen.getByText(f.instrument_display!.license_label!)).toBeTruthy();
 expect(screen.getByText('Purchased instrument display; original accepted evidence retained.')).toBeTruthy();
 expect(screen.getByText('Original seller evidence for the purchased version; not a checkout receipt.')).toBeTruthy();
 expect(screen.getByTitle('Original seller evidence for purchased version').getAttribute('srcdoc')).toContain('ai.market Standard Data Licence v1.0');
 expect(screen.getByRole('link',{name:'Current public display (may differ from this purchase)'}).getAttribute('href')).toBe(`/listings/${f.listing_id}`);
 expect(screen.queryByRole('checkbox')).toBeNull();
 expect(screen.queryByRole('button')).toBeNull();
 expect(JSON.stringify(f)).toBe(before);
});
it('never renders unverified retained HTML and aborts the prior order read',async()=>{
 const f=wire.purchased[0];
 client.get.mockResolvedValue({data:{...f,retained_presentation:{...f.retained_presentation,presentation:wire.public[2].corrected}},headers:{'cache-control':'private, no-store'}});
 const view=render(<PurchasedLicenseDisplay orderId={f.order_id} listingId={f.listing_id}/>);
 await screen.findByText(/Purchased licence display is unavailable/);
 expect(screen.queryByTitle('Original seller evidence for purchased version')).toBeNull();
 const signal=client.get.mock.calls[0][1].signal;
 view.unmount();expect(signal.aborted).toBe(true);
});
it('does not install an old response after changing orders',async()=>{
 let finish!:(v:unknown)=>void;
 client.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const first=wire.purchased[0],second=wire.purchased[1];
 const view=render(<PurchasedLicenseDisplay orderId={first.order_id} listingId={first.listing_id}/>);
 client.get.mockResolvedValue({data:second,headers:{'cache-control':'private, no-store'}});
 view.rerender(<PurchasedLicenseDisplay orderId={second.order_id} listingId={second.listing_id}/>);
 await screen.findByText(second.instrument_display!.license_label!);
 finish({data:first,headers:{'cache-control':'private, no-store'}});
 await waitFor(()=>expect(screen.queryByText(first.instrument_display!.license_label!)).toBeNull());
});
