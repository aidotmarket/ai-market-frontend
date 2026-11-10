// @vitest-environment jsdom
import {render,screen,cleanup,act} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import CurrentDisplayFreshness from './CurrentDisplayFreshness';
const refresh=vi.hoisted(()=>vi.fn());
vi.mock('next/navigation',()=>({useRouter:()=>({refresh})}));
afterEach(()=>{cleanup();vi.useRealTimers();refresh.mockClear();});
it('refreshes the whole display every five minutes and hides stale HTML after ten if refresh never delivers',()=>{
 vi.useFakeTimers();vi.setSystemTime(1000000);
 const view=render(<CurrentDisplayFreshness observedAt={Date.now()}><iframe title="current" srcDoc="verified"/></CurrentDisplayFreshness>);
 act(()=>vi.advanceTimersByTime(5*60_000));expect(refresh).toHaveBeenCalledTimes(1);expect(screen.getByTitle('current')).toBeTruthy();
 act(()=>vi.advanceTimersByTime(5*60_000));expect(screen.queryByTitle('current')).toBeNull();expect(screen.getByRole('status').textContent).toContain('Refresh this page');
 view.rerender(<CurrentDisplayFreshness observedAt={Date.now()}><iframe title="fresh" srcDoc="new verified"/></CurrentDisplayFreshness>);
 expect(screen.getByTitle('fresh')).toBeTruthy();
});
it('expires a restored stale view immediately and requests fresh data',()=>{
 vi.useFakeTimers();vi.setSystemTime(2000000);
 render(<CurrentDisplayFreshness observedAt={Date.now()-11*60_000}><iframe title="stale"/></CurrentDisplayFreshness>);
 expect(screen.queryByTitle('stale')).toBeNull();
 act(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 expect(refresh).toHaveBeenCalled();
});
