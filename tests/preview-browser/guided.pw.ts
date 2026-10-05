import {test,expect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {categoryRows,guidedCapabilities,guidedConnection,guidedObjects,emptyGuidedDraft} from '../guidedListingFixture';
import type {SavedListingDraft} from '../../api/sellerListingDraft';
import type {SourceRead} from '../../api/sellerListingSource';
import type {ApprovalReceipt,ListingReview} from '../../api/sellerListingReview';
import type {PublicationReceipt} from '../../api/sellerListingPublication';
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');

for(const width of [1280,390])test(`${width}px synthetic seller publishes using checklist and Next`,async({page})=>{
 let draft:SavedListingDraft|null=null,source:SourceRead|null=null,approval:ApprovalReceipt|null=null,publication:PublicationReceipt|null=null;
 const calls:{path:string;method:string;body:unknown}[]=[];const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().includes('same key'))errors.push(m.text());});
 await page.setViewportSize({width,height:1000});
 const cors={'access-control-allow-origin':'http://127.0.0.1:4178','access-control-allow-credentials':'true','content-type':'application/json'};
 function review():ListingReview{
  const fields={...draft!.content,license:'ai.market Standard Data Licence v1.0'};
  const rendered_html=`<!doctype html><html><body><h1>${fields.title}</h1><p>${fields.description}</p></body></html>`;
  const render_hash=hash(rendered_html),review_hash=hash(JSON.stringify([draft!.version,source!.version,fields]));
  const missing_fields=['title','description','category','tags','price'].filter(k=>!fields[k as keyof typeof fields]);
  const source_hash='a'.repeat(64);
  return {fields,draft_version:draft!.version,source_version:source!.version,presentation_version:'seller-listing-review-v2',review_hash,missing_fields,approval_available:!missing_fields.length,
   rendered_html,render_hash,confirmation_version:'seller-listing-confirmation-v3',confirmation_statements:{ownership_confirmed:'I own the rights.',privacy_confirmed:'The files respect privacy.',price_confirmed:'I confirm the price.',license_confirmed:'I confirm this licence.',covenant_authority_confirmed:'I confirm covenant and authority.',public_disclosure_confirmed:'I confirm the public text.'},license_selection:fields.license_selection,approval,sample_decision:'none',sample_object_indices:[],sample_status:'not_selected',source_hash,
   source_page:{review_hash,source_version:source!.version,source_hash,offset:0,page_size:100,total_count:source!.content.objects.length,total_size_bytes:2048,files:source!.content.objects,next_cursor:null}};
 }
 await page.route('https://api.preview.test/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname.replace('/api/v1',''),method=request.method();
  if(method==='OPTIONS'){await route.fulfill({status:204,headers:{...cors,'access-control-allow-methods':'GET,POST,PUT,OPTIONS','access-control-allow-headers':'authorization,content-type'}});return;}
  const body=request.postDataJSON();calls.push({path,method,body});
  const reply=(value:unknown,status=200)=>route.fulfill({status,headers:cors,body:JSON.stringify(value)});
  if(path==='/seller-workspace/capabilities')return reply(guidedCapabilities);
  if(path==='/auth/capabilities')return reply({seller:{effective_status:'active',missing_steps:[]},next_action:null});
  if(path==='/seller-workspace/connections')return reply({connections:[guidedConnection]});
  if(path.endsWith('/source-objects'))return reply({objects:guidedObjects,next_cursor:null});
  if(path==='/seller-workspace/categories')return reply(categoryRows);
  if(path==='/seller-workspace/listing-source'){
   if(method==='PUT'){source={version:(source?.version??0)+1,content:body.content,connection_current:true};approval=null;}
   return reply({source});
  }
  if(path==='/seller-workspace/listing-draft'){
   if(method==='PUT'){draft={version:(draft?.version??0)+1,content:{...emptyGuidedDraft,...body.content},updated_at:'2026-10-01T00:00:00Z'};approval=null;}
   return reply({draft});
  }
  if(path.startsWith('/seller-workspace/legal-identity'))return reply({status:'known',source:'stripe_connect',legal_name:'Synthetic Seller',jurisdiction:'ES',version:1});
  if(path.startsWith('/licenses/'))return reply({full_text:'Exact synthetic full licence or covenant text. No money or external storage access.'});
  if(path==='/seller-workspace/listing-assistant')return reply({source_version:source!.version,message:'See the suggested changes under each field on the left.',proposals:[{field:'title',value:'Weekly regional sales',reasoning:'Selected sales file.'},{field:'description',value:'Weekly sales by region from the selected file.',reasoning:'Matches your files.'},{field:'category',value:'financial-data',reasoning:'A table slug.'},{field:'tags',value:'sales, weekly',reasoning:'Useful tags.'}]});
  if(path==='/seller-workspace/listing-review')return reply(review());
  if(path==='/seller-workspace/listing-approval'){
   const r=review();approval={id:'00000000-0000-4000-8000-000000000002',review_hash:r.review_hash,render_hash:r.render_hash,draft_version:draft!.version,source_version:source!.version,approved_at:'2026-10-01T00:00:00Z',sample_decision:'none',license_selection:draft!.content.license_selection};return reply(approval);
  }
  if(path==='/seller-workspace/listing-publication'){
   if(method==='POST')publication={id:'00000000-0000-4000-8000-000000000003',approval_id:approval!.id,listing_id:'00000000-0000-4000-8000-000000000004',listing_version_id:'00000000-0000-4000-8000-000000000005',title:draft!.content.title,slug:'synthetic-sales',status:'published',is_listed:true,published_at:'2026-10-01T00:00:00Z',review_hash:approval!.review_hash,render_hash:approval!.render_hash};
   return reply(method==='POST'?publication:{publication_available:true,publication});
  }
  return reply({detail:'not available in synthetic fixture'},404);
 });
 await page.goto('/tests/preview-browser/index.html?guided');
 const checklist=page.getByRole('complementary',{name:'Listing checklist'});
 if(width<1280)await checklist.getByRole('button',{name:/Listing checklist/}).click();
 const oneNext=async(name:string)=>{await expect(checklist.locator('li').filter({hasText:'· Next'})).toHaveCount(1);await expect(checklist.getByRole('button',{name:`Next: ${name} →`,exact:true})).toBeVisible();};
 await oneNext('Choose your files');await checklist.getByRole('button',{name:'Next: Choose your files →',exact:true}).click();
 await page.getByRole('checkbox',{name:'Select weekly/sales.csv'}).check();
 await page.getByRole('region',{name:'Choose your files',exact:true}).getByRole('button',{name:'Next: Choose a licence →',exact:true}).click();await oneNext('Choose a licence');
 // Resume a saved selection after reload: no duplicate source save or operator guidance.
 await page.reload();if(width<1280)await checklist.getByRole('button',{name:/Listing checklist/}).click();await oneNext('Choose a licence');
 await checklist.getByRole('button',{name:/2\. Choose your files/}).click();await expect(page.getByRole('checkbox',{name:'Select weekly/sales.csv'})).toBeChecked();await expect(page.getByRole('button',{name:'Save selected files',exact:true})).toHaveCount(0);
 await page.getByRole('region',{name:'Choose your files',exact:true}).getByRole('button',{name:'Next: Choose a licence →',exact:true}).click();
 const licenceLink=page.getByRole('link',{name:'Read licence',exact:true});
 await expect(licenceLink).toHaveAttribute('href','/licenses/standard/1.0/ai-training');
 await expect(licenceLink).toHaveAttribute('target','_blank');
 await expect(licenceLink).not.toHaveAttribute('download');
 await page.context().route('http://127.0.0.1:4178/licenses/standard/1.0/ai-training',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><h1>ai.market Standard Data Licence v1.0</h1><p>Exact synthetic full licence or covenant text. No money or external storage access.</p></body></html>'}));
 await expect(page.getByText('Legal name on the licence: Synthetic Seller (ES)',{exact:true})).toBeVisible();
 const savesBeforeReading=calls.filter(c=>c.method==='PUT'||c.method==='POST').length;
 const popupPromise=page.waitForEvent('popup');
 await licenceLink.focus();await page.keyboard.press('Enter');
 const licencePage=await popupPromise;
 await expect(licencePage).toHaveURL('http://127.0.0.1:4178/licenses/standard/1.0/ai-training');
 await expect(licencePage.getByRole('heading',{name:'ai.market Standard Data Licence v1.0'})).toBeVisible();
 await expect(page.getByRole('radio',{name:/Standard/})).toBeChecked();
 await expect(page.getByRole('checkbox',{name:'Confirm covenant and authority'})).not.toBeChecked();
 expect(calls.filter(c=>c.method==='PUT'||c.method==='POST')).toHaveLength(savesBeforeReading);
 await licencePage.close();
 await page.getByText('Read the summary and full terms', {exact:true}).click();
 await page.getByRole('button',{name:'Read full licence',exact:true}).click();await expect(page.getByRole('dialog',{name:'Read full licence'})).toBeVisible();
 await page.keyboard.press('Shift+Tab');await expect(page.getByRole('link',{name:'Open in new tab'})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Close',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Read full licence',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Read Marketplace Listing Covenant',exact:true}).click();await page.keyboard.press('Escape');
 await page.getByLabel('Signer full name',{exact:true}).fill('Sam Seller');await page.getByLabel('Signer title',{exact:true}).fill('Owner');await page.getByRole('checkbox',{name:'Confirm covenant and authority'}).check();
 await page.getByRole('button',{name:'Next: Describe and price →',exact:true}).click();await oneNext('Describe and price');
 expect(draft!.content.category).toBe('');
 await page.getByLabel('Give Allai a starting point').fill('Draft the current weekly sales file.');await page.getByRole('button',{name:'Ask Allai to draft my listing',exact:true}).click();await page.getByRole('button',{name:'Use all Allai suggestions'}).click();
 await page.getByLabel('Your price (USD)').fill('25');await page.getByRole('button',{name:'Next: Review →',exact:true}).click();await oneNext('Review');
 expect(draft!.content.description_source_version).toBe(source!.version);expect(calls.find(c=>c.path.endsWith('listing-assistant'))!.body).not.toHaveProperty('source_summary');
 await expect(page.getByRole('button',{name:'Approve this review'})).toBeVisible();
 for(const checkbox of await page.getByRole('checkbox').all())await checkbox.check();
 await page.getByRole('button',{name:'Approve this review',exact:true}).click();await oneNext('Publish');
 await page.getByRole('button',{name:'Next: Publish →',exact:true}).last().click();await page.getByRole('button',{name:'Publish this listing'}).click();
 await expect(checklist.getByRole('link',{name:'Published: view your listing'})).toHaveAttribute('href','/listings/synthetic-sales');await expect(checklist.locator('li').filter({hasText:'· Next'})).toHaveCount(0);
 await expect(checklist.getByRole('button',{name:'Start another listing'})).toBeVisible();
 expect(calls.filter(c=>c.method==='PUT'&&c.path.endsWith('listing-source'))).toHaveLength(1);expect(calls.filter(c=>c.method==='PUT'&&c.path.endsWith('listing-draft'))).toHaveLength(2);expect(errors).toEqual([]);
});
