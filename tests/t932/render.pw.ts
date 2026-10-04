import {test,expect,type Page} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const evidence=resolve('docs/reports/t932');
const available={enabled:true,status:'available',reason:'enabled'};
const unavailable={enabled:false,status:'unavailable',reason:'not_implemented'};
const workspace={master:available,providers:{aws:{connect:available,profile:unavailable,publish:unavailable,delivery:unavailable},r2:{connect:available,profile:unavailable,publish:unavailable,delivery:unavailable}}};
type Mode='google'|'github'|'native'|'password'|'sso';
async function fixture(page:Page,mode:Mode,firstPublish=false){
 const calls:{path:string;method:string;body:unknown}[]=[];const blocked:string[]=[];const errors:string[]=[];
 let published=false;
 const provider=mode==='google'||mode==='github'?mode:null;
 const user={id:'00000000-0000-4000-8000-000000000001',email:'synthetic@example.test',first_name:'Sam',last_name:'Seller',company_name:'Fixture Co',role:'seller',status:'active',created_at:'2026-10-01T00:00:00Z',email_verified_at:'2026-10-01T00:00:00Z',totp_enabled:mode==='native',auth_methods:provider?[provider,'password']:mode==='sso'?['sso']:['password'],primary_auth:'password',sso_enforced:mode==='sso',
 two_factor_setup_eligible:mode==='password',two_factor_setup_reason:provider?'two_factor_managed_by_provider':mode==='native'?'two_factor_already_enabled':mode==='sso'?'two_factor_managed_by_sso':null,two_factor_provider:provider,seller_two_factor_satisfied:!!provider||mode==='native',reauth_method:provider?'magic_link':mode==='native'?'totp':mode==='sso'?'magic_link':'password'};
 const account=()=>({buyer:{persisted_status:'active',effective_status:'active',missing_steps:[],reason:null},seller:{persisted_status:firstPublish&&!published?'active':'provisioning',effective_status:firstPublish&&!published?'active':'provisioning',missing_steps:user.seller_two_factor_satisfied?['stripe_payouts_live']:['totp_enabled','stripe_payouts_live'],reason:null},next_action:{capability:'seller',step:user.seller_two_factor_satisfied?'stripe_payouts_live':'totp_enabled'}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request();const url=new URL(req.url());
  if(!['127.0.0.1','localhost'].includes(url.hostname)){blocked.push(req.url());return route.abort();}
  if(url.port!=='4201')return route.continue();
  const path=url.pathname.replace('/api/v1',''),method=req.method();
  const headers={'access-control-allow-origin':'http://127.0.0.1:4189','access-control-allow-credentials':'true','access-control-allow-methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS','access-control-allow-headers':'authorization,content-type,idempotency-key,x-payin-reauth','content-type':'application/json'};
  if(method==='OPTIONS')return route.fulfill({status:204,headers});
  calls.push({path,method,body:req.postDataJSON()});
  const reply=(data:unknown,status=200)=>route.fulfill({status,headers,body:JSON.stringify(data)});
  if(path==='/auth/refresh')return reply({access_token:'test',token_type:'bearer'});
  if(path==='/auth/me')return reply(user);
  if(path==='/auth/capabilities')return reply(account());
  if(path==='/connector-oauth/status')return reply({enabled:false});
  if(path==='/connect/status')return reply({details_submitted:false,payouts_enabled:false});
  if(path==='/connect/onboarding')return reply({detail:'Complete 2FA setup before connecting Stripe'},403);
  if(path==='/orders/mine'||path==='/listings/mine'||path==='/seller/gateways')return reply([]);
  if(path==='/seller/stats')return reply({period:'30d',total_listings:0,total_views:0,total_inquiries:0,total_sales:0,period_sales:0,period_revenue_cents:0,period_revenue_display:'$0.00',pending_fulfillments:0,conversion_rate:0});
  if(path==='/seller-workspace/capabilities')return reply(workspace);
  if(path==='/seller-workspace/connections'&&method==='GET')return reply({connections:[]});
  if(path.startsWith('/seller-workspace/connections')&&method==='POST')return reply({detail:'Complete 2FA setup before connecting cloud storage'},403);
  if(path==='/data-verification/payment-method/readiness')return reply({version:'data_verification_payin_readiness_v1',state:'setup_required',can_start_setup:true,can_replace_payment_method:false,message:'fixture'});
  if(path==='/auth/reauth')return reply({method:user.reauth_method,token:null,message:'Re-authentication link sent',token_type:null,expires_in:null});
  if(path==='/listings/fixture/publish'){published=true;return reply({status:'published'});}
  if(path==='/listings/fixture')return reply({id:'fixture',title:'Synthetic listing',status:'unlisted',price:25,description:'Isolated listing fixture'});
  if(path==='/legal/terms/current')return reply({terms_version:'1.2'});
  return reply({detail:'not in isolated T932 fixture'},404);
 });
 return {calls,blocked,errors};
}
async function screenshot(page:Page,name:string){
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:resolve(evidence,`${name}.png`),fullPage:true});
}
for(const width of [1440,390])for(const provider of ['google','github'] as const)test(`${provider} ${width}: settings, wizard navigation, Stripe refusal and explicit magic link`,async({page})=>{
 mkdirSync(evidence,{recursive:true});await page.setViewportSize({width,height:900});const proof=await fixture(page,provider);
 await page.goto('/dashboard/settings#security');const security=page.locator('#security');
 await expect(security.getByText(`Sign-in security is managed by your ${provider==='google'?'Google':'GitHub'} account.`)).toBeVisible();
 await expect(page.getByRole('button',{name:'Enable two-factor authentication'})).toHaveCount(0);
 await screenshot(page,`${provider}-${width}-settings`);
 const wizard=page.locator('#seller-setup-next');await expect(wizard.getByText('3 of 4 complete')).toBeVisible();
 await expect(wizard.getByRole('button',{name:/Provider sign-in/})).toBeDisabled();
 await wizard.getByRole('button',{name:/Company name/}).click();await expect(page).toHaveURL(/#company$/);await expect(page.locator('#company')).toBeInViewport();
 await page.goto('/dashboard');await expect(page.getByRole('button',{name:'Connect Stripe',exact:true})).toBeEnabled();
 await screenshot(page,`${provider}-${width}-wizard`);
 await page.getByRole('button',{name:'Collapse seller setup progress'}).click();await screenshot(page,`${provider}-${width}-dashboard`);await page.getByRole('button',{name:'Expand seller setup progress'}).click();
 await page.locator('#seller-setup-next').getByRole('button',{name:'Continue: Stripe payouts'}).click();
 await expect(page.getByText(/Complete the sign-in security step before connecting payouts/)).toBeVisible();
 await page.goto('/dashboard/data-verification/payment-method');await page.getByRole('button',{name:'Add payment method'}).click();
 const dialog=page.getByRole('dialog',{name:'Re-authenticate'});await expect(dialog.getByRole('button',{name:'Send link'})).toBeVisible();
 await expect(dialog.getByLabel('Password')).toHaveCount(0);expect(proof.calls.filter(c=>c.path==='/auth/reauth')).toHaveLength(0);
 await screenshot(page,`${provider}-${width}-reauth`);
 await dialog.getByRole('button',{name:'Send link'}).click();await expect(dialog.getByLabel('Email link')).toBeVisible();
 expect(proof.calls.find(c=>c.path==='/auth/reauth')?.body).toEqual({method:'magic_link'});
 expect(proof.calls.some(c=>c.path.startsWith('/auth/2fa/')||c.path.includes('/setup-sessions')||c.path.includes('/connector/grants'))).toBe(false);
 expect(proof.blocked).toEqual([]);expect(proof.errors).toEqual([]);
 writeFileSync(resolve(evidence,`${provider}-${width}-requests.json`),JSON.stringify(proof,null,2));
});
for(const width of [1440,390])test(`first publish ${width}: server next step appears; cloud security guards remain`,async({page})=>{
 await page.setViewportSize({width,height:900});const proof=await fixture(page,'google',true);
 await page.goto('/dashboard/listings/fixture/edit');await page.getByRole('button',{name:'Publish',exact:true}).click();
 await expect(page.locator('#seller-setup-next').getByRole('button',{name:'Continue: Stripe payouts'})).toBeVisible();
 await expect(page.locator('#seller-setup-next').getByRole('button',{name:/Provider sign-in/})).toBeDisabled();
 await screenshot(page,`first-publish-${width}`);
 await page.goto('/dashboard/seller-workspace');await page.getByRole('button',{name:'Add AWS connection'}).click();
 await expect(page.getByRole('alert').filter({hasText:'sign-in security step'})).toBeVisible();
 await page.getByRole('button',{name:'Collapse seller setup progress'}).click();
 await screenshot(page,`cloud-refusal-${width}`);
 expect(proof.calls.filter(c=>c.path==='/listings/fixture/publish')).toHaveLength(1);
 expect(proof.calls.filter(c=>c.path==='/seller-workspace/connections'&&c.method==='POST')).toHaveLength(1);
 expect(proof.blocked).toEqual([]);expect(proof.errors).toEqual([]);
 writeFileSync(resolve(evidence,`first-publish-${width}-requests.json`),JSON.stringify(proof,null,2));
});
for(const mode of ['native','password','sso'] as const)test(`${mode}: native/password/SSO controls remain`,async({page})=>{
 await fixture(page,mode);await page.goto('/dashboard/settings#security');
 if(mode==='native'){await expect(page.getByRole('button',{name:'Disable 2FA'})).toBeVisible();await page.getByRole('button',{name:'Disable 2FA'}).click();await expect(page.getByText('Confirm 2FA disable')).toBeVisible();}
 if(mode==='password'){await page.getByRole('button',{name:'Enable two-factor authentication'}).click();await expect(page.getByRole('dialog').getByLabel('Password')).toBeVisible();}
 if(mode==='sso'){await expect(page.locator('#security').getByText(/managed by your organization's single sign-on/)).toBeVisible();await expect(page.getByRole('button',{name:'Enable two-factor authentication'})).toHaveCount(0);}
 await screenshot(page,`${mode}-desktop-controls`);
});
