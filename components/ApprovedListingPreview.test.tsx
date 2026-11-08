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

it('measures v3 headings, breaks and ordered starts while stripping unsafe attributes',()=>{
 const html='<h4 onclick="bad()">Details</h4><p>First<br>Second</p><ol start="7" class="discard" onclick="bad()"><li>Seven</li></ol><ol start="-2"><li>Invalid</li></ol><ol start="1"><li>Default</li></ol>';
 render(<ApprovedListingPreview html={html} title="v3 listing"/>);
 const measure=screen.getByTitle('Preview layout measurement') as HTMLIFrameElement;
 const copy=new DOMParser().parseFromString(measure.srcdoc,'text/html');
 expect(copy.querySelector('h4')?.outerHTML).toBe('<h4>Details</h4>');
 expect(copy.querySelector('p')?.innerHTML).toBe('First<br>Second');
 expect(copy.querySelector('ol')?.outerHTML).toBe('<ol start="7"><li>Seven</li></ol>');
 expect([...copy.querySelectorAll('ol')].slice(1).every(el=>el.attributes.length===0)).toBe(true);
 expect((screen.getByTitle('v3 listing') as HTMLIFrameElement).srcdoc).toBe(html);
});
