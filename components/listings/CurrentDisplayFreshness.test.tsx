// @vitest-environment jsdom
import {render,screen,cleanup,act} from '@testing-library/react';
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
it.each(['visibilitychange','pageshow','resume'])('invalidates a suspended/restored projection on %s even if monotonic clock paused',event=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance','Date']});
 const id=projection();
 const view=render(page(id));
 // OS sleep may advance neither timers nor performance.now on some platforms.
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
