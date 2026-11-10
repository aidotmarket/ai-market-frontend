// @vitest-environment jsdom
import {useEffect,useState} from 'react';
import {render,screen,cleanup,act,fireEvent} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import CurrentDisplayFreshness from './CurrentDisplayFreshness';
const refresh=vi.hoisted(()=>vi.fn());
const router={refresh};
let token=1_000_000;
const projection=()=>++token;
vi.mock('next/navigation',()=>({useRouter:()=>router}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();refresh.mockClear();});
const page=(projection:number)=><CurrentDisplayFreshness observedAt={projection}><iframe title="current" srcDoc="verified"/><button>Purchase</button></CurrentDisplayFreshness>;
it.each([-60,20])('retains fresh HTML and purchase controls at browser offset %s minutes, then expires failed refreshes',offset=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance','Date']});
 vi.setSystemTime(1_000_000+offset*60_000);
 const id=projection();
 const view=render(page(id));
 expect(screen.getByTitle('current')).toBeTruthy();expect(screen.getByText('Purchase')).toBeTruthy();
 act(()=>vi.advanceTimersByTime(5*60_000));expect(refresh).toHaveBeenCalledTimes(1);
 view.rerender(page(id));
 act(()=>vi.advanceTimersByTime(5*60_000));expect(screen.queryByTitle('current')).toBeNull();expect(screen.queryByText('Purchase')).toBeNull();
 // A failed refresh or arbitrary rerender cannot renew the same projection.
 view.rerender(page(id));expect(screen.getByRole('status')).toBeTruthy();
 // Only newly delivered projection identity renews the lease.
 view.rerender(page(projection()));expect(screen.getByTitle('current')).toBeTruthy();
});
it.each([-120,120])('wall clock adjustment %s minutes cannot change elapsed retention',adjustment=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance','Date']});vi.setSystemTime(1_000_000);
 render(page(projection()));act(()=>vi.advanceTimersByTime(5*60_000));
 vi.setSystemTime(Date.now()+adjustment*60_000);
 expect(screen.getByTitle('current')).toBeTruthy();
 act(()=>vi.advanceTimersByTime(5*60_000));expect(screen.queryByTitle('current')).toBeNull();
});
it.each(['visibilitychange','pageshow','resume'])('withholds a suspended/restored projection on %s when wall time advances during paused monotonic time',event=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance','Date']});
 const id=projection();
 const view=render(page(id));
 // OS sleep may pause timers/performance.now; wall time still records sleep.
 vi.setSystemTime(Date.now()+60*60_000);
 act(()=>event==='pageshow'?window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})):document.dispatchEvent(new Event(event)));
 expect(refresh).toHaveBeenCalledTimes(1);expect(screen.queryByTitle('current')).toBeNull();
 view.rerender(page(id));expect(screen.queryByTitle('current')).toBeNull();
 view.rerender(page(projection()));expect(screen.getByTitle('current')).toBeTruthy();
});
it('ignores ordinary pageshow and hidden visibility events',()=>{
 render(page(projection()));
 vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');
 act(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:false}));});
 expect(refresh).not.toHaveBeenCalled();expect(screen.getByTitle('current')).toBeTruthy();
});

it('keeps router-cache remounts expired and automatically requests a fresh projection',()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance','Date']});
 const id=projection();
 const view=render(page(id));
 act(()=>vi.advanceTimersByTime(11*60_000));
 view.unmount();refresh.mockClear();
 render(page(id));
 expect(screen.queryByTitle('current')).toBeNull();expect(refresh).toHaveBeenCalledTimes(1);
});
it.each([-60,60])('invalidates on a wall discontinuity of %s minutes, including foreground sleep with a paused monotonic clock',minutes=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance','Date']});
 const id=projection();
 const view=render(page(id));
 vi.setSystemTime(Date.now()+minutes*60_000);
 act(()=>vi.advanceTimersByTime(5*60_000));
 expect(screen.queryByTitle('current')).toBeNull();expect(refresh).toHaveBeenCalledTimes(1);
 view.rerender(page(id));expect(screen.queryByTitle('current')).toBeNull();
 view.rerender(page(projection()));expect(screen.getByTitle('current')).toBeTruthy();
});

const returnEvents=['visibilitychange','pageshow','resume'] as const;
function returnToPage(event:typeof returnEvents[number]) {
 if(event==='pageshow')window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 else document.dispatchEvent(new Event(event));
}
function TypedPurchaseState({onMount,onUnmount}:{onMount:()=>void;onUnmount:()=>void}) {
 const [name,setName]=useState('');
 useEffect(()=>{onMount();return onUnmount;},[onMount,onUnmount]);
 return <label>Signer name<input value={name} onChange={event=>setName(event.target.value)}/></label>;
}
it.each(returnEvents)('retains typed client state on fresh %s and failed refresh without renewing the lease',event=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance','Date']});
 const id=projection();
 const onMount=vi.fn(),onUnmount=vi.fn();
 const statefulPage=(observedAt:number)=><CurrentDisplayFreshness observedAt={observedAt}><TypedPurchaseState onMount={onMount} onUnmount={onUnmount}/></CurrentDisplayFreshness>;
 const view=render(statefulPage(id));
 const input=screen.getByRole('textbox',{name:'Signer name'});
 fireEvent.change(input,{target:{value:'Synthetic buyer'}});
 act(()=>vi.advanceTimersByTime(1000));
 act(()=>returnToPage(event));
 expect(refresh).toHaveBeenCalledTimes(1);
 expect(screen.getByRole('textbox')).toBe(input);
 expect(input).toHaveProperty('value','Synthetic buyer');
 expect(onMount).toHaveBeenCalledTimes(1);expect(onUnmount).not.toHaveBeenCalled();
 // A failed refresh delivers no new props. An unchanged RSC result likewise
 // cannot renew the lease or discard typed state while this page is fresh.
 view.rerender(statefulPage(id));
 act(()=>vi.advanceTimersByTime(5*60_000));
 expect(refresh).toHaveBeenCalledTimes(2);
 expect(screen.getByRole('textbox')).toBe(input);
 expect(input).toHaveProperty('value','Synthetic buyer');
 expect(onUnmount).not.toHaveBeenCalled();
 // Return events and failed/unchanged refreshes never extend ten-minute age.
 act(()=>vi.advanceTimersByTime(5*60_000-1000));
 expect(screen.queryByRole('textbox')).toBeNull();expect(screen.getByRole('status')).toBeTruthy();
 expect(onUnmount).toHaveBeenCalledTimes(1);
 view.rerender(statefulPage(id));expect(screen.queryByRole('textbox')).toBeNull();
 view.rerender(statefulPage(projection()));expect(screen.getByRole('textbox')).toHaveProperty('value','');
});
it.each(returnEvents)('checks genuine elapsed expiry immediately on %s before the next interval',event=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance','Date']});
 const id=projection();
 const view=render(page(id));
 // Simulate timers suspended while monotonic and wall clocks keep advancing.
 vi.spyOn(performance,'now').mockReturnValue(10*60_000);
 vi.setSystemTime(Date.now()+10*60_000);
 act(()=>returnToPage(event));
 expect(refresh).toHaveBeenCalledTimes(1);expect(screen.queryByTitle('current')).toBeNull();
 view.rerender(page(id));expect(screen.queryByTitle('current')).toBeNull();
 view.rerender(page(projection()));expect(screen.getByTitle('current')).toBeTruthy();
});
it('does not renew a still-fresh projection on router-cache remount',()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance','Date']});
 const id=projection();
 const view=render(page(id));
 act(()=>vi.advanceTimersByTime(6*60_000));view.unmount();
 render(page(id));expect(screen.getByTitle('current')).toBeTruthy();
 act(()=>vi.advanceTimersByTime(5*60_000));expect(screen.queryByTitle('current')).toBeNull();
});
