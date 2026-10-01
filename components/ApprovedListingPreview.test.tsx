// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import ApprovedListingPreview from './ApprovedListingPreview';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('preserves exact approved HTML in the opaque sandbox and measures only resource-free text markup',()=>{
 const html='<style>body{padding:24px}</style><h1 class="title" onclick="alert(1)">Approved</h1><script>parent.bad=true</script><img src="https://bad.example"><meta http-equiv="refresh" content="0;url=https://bad.example">';
 const onLoad=vi.fn();const view=render(<ApprovedListingPreview html={html} title="Approved listing" onLoad={onLoad}/>);
 const visible=screen.getByTitle('Approved listing') as HTMLIFrameElement;
 const measure=screen.getByTitle('Preview layout measurement') as HTMLIFrameElement;
 expect(visible.srcdoc).toBe(html);expect(visible.getAttribute('sandbox')).toBe('');expect(visible.getAttribute('referrerpolicy')).toBe('no-referrer');
 expect(measure.srcdoc).toContain('default-src');expect(measure.srcdoc).toContain('<h1 class="title">Approved</h1>');
 expect(measure.srcdoc).not.toMatch(/onclick|<script|<img|http-equiv="refresh"/);
 Object.defineProperty(measure.contentDocument!.body,'scrollHeight',{value:220,configurable:true});
 fireEvent.load(measure);expect(visible.style.height).toBe('222px');expect(visible.style.maxHeight).toBe('min(720px,80vh)');
 Object.defineProperty(measure.contentDocument!.body,'scrollHeight',{value:110,configurable:true});
 act(()=>window.dispatchEvent(new Event('resize')));expect(visible.style.height).toBe('112px');
 expect(onLoad).not.toHaveBeenCalled();fireEvent.load(visible);expect(onLoad).toHaveBeenCalledOnce();
 view.unmount();expect(measure.isConnected).toBe(false);
});
