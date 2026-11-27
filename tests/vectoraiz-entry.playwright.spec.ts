import {expect,test} from '@playwright/test';
import {deflateRawSync} from 'node:zlib';

// Only the assigned local service is used. Backend requests never leave the browser harness.
test.use({baseURL:`http://127.0.0.1:${process.env.KD_BRIDGE_PORT_BASE}`});
const payload=deflateRawSync(JSON.stringify({version:1,pack_id:'00000000-0000-4000-8000-000000000001',draft:{title:'Pack',brief:'',description:'',category:'',tags:''},files:[{size:1,sha256:'a'.repeat(64)}]})).toString('base64url');
for(const path of ['/login','/does-not-exist','/dashboard/error','/dashboard/gateways']){
  for(const fragment of [payload,'malformed']){
    test(`MEDIUM 3 / CC F2 actual route tree strips ${path} ${fragment===payload?'valid':'malformed'} before hydration and after router.refresh`,async({page})=>{
      await page.route('**/api/**',route=>route.fulfill({status:401,json:{detail:'No session'}}));
      await page.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>{(window as unknown as {entryHash:string}).entryHash=location.hash;},{once:true});});
      await page.goto(`${path}?keep=yes#vz=${fragment}`);
      await expect.poll(()=>page.evaluate(()=>location.hash)).toBe('');
      expect(await page.evaluate(()=>(window as unknown as {entryHash:string}).entryHash)).toBe('');
      const stash=await page.evaluate(()=>sessionStorage.getItem('aim.vectoraiz.handoff.v1'));
      // Next's actual development app router, including its canonical URL history updater.
      await page.waitForFunction(()=>Boolean((window as unknown as {next?:{router?:unknown}}).next?.router));
      await page.evaluate(()=>{(window as unknown as {next:{router:{refresh:()=>void}}}).next.router.refresh();});
      await page.waitForTimeout(600);
      expect(await page.evaluate(()=>location.hash)).toBe('');
      expect(await page.evaluate(()=>sessionStorage.getItem('aim.vectoraiz.handoff.v1'))).toBe(stash);
      if(!path.startsWith('/dashboard/'))expect(await page.evaluate(()=>sessionStorage.getItem('aim.vectoraiz.handoff.v1'))).toBeNull();
    });
  }
}

test('CC F2 a same-tab fragment change updates Next canonical URL before router.refresh',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({status:401,json:{detail:'No session'}}));
 await page.goto('/login');
 await page.waitForFunction(()=>Boolean((window as unknown as {next?:{router?:unknown}}).next?.router));
 await page.evaluate(fragment=>{location.hash='vz='+fragment;},payload);
 await expect.poll(()=>page.evaluate(()=>location.hash)).toBe('');
 await page.evaluate(()=>{(window as unknown as {next:{router:{refresh:()=>void}}}).next.router.refresh();});
 await page.waitForTimeout(600);
 expect(await page.evaluate(()=>location.hash)).toBe('');
 expect(await page.evaluate(()=>sessionStorage.getItem('aim.vectoraiz.handoff.v1'))).toBeNull();
});
