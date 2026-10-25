/* Narrow regression harness: only selected store TSX executes in a strict VM.
 * Node 24; SELLER_DRAFT_PROBE_MODULES points at existing React/jsdom/TypeScript.
 * No app/auth/client modules execute. APIs, lifecycle and UUID are fake ports.
 */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const modules = process.env.SELLER_DRAFT_PROBE_MODULES;
if (!modules) throw Error('Set SELLER_DRAFT_PROBE_MODULES to existing dependencies');
const React = require(modules + '/react');
const {JSDOM} = require(modules + '/jsdom');
const ts = require(modules + '/typescript');
const jsx = require(modules + '/react/jsx-runtime');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'https://example.invalid/seller'});
global.window = dom.window; global.document = dom.window.document;
Object.defineProperty(global, 'navigator', {value:dom.window.navigator, configurable:true});
global.HTMLElement = dom.window.HTMLElement; global.IS_REACT_ACT_ENVIRONMENT = true;
const refuse = () => {throw Error('Unmocked operation refused');};
global.fetch = refuse; window.fetch = refuse; window.XMLHttpRequest.prototype.open = refuse;
for (const name of ['http','https']) {const port = require(name); port.request = refuse; port.get = refuse;}
const {createRoot} = require(modules + '/react-dom/client');
const sourcePath = process.argv[2] || __dirname + '/SellerListingDraftStore.tsx';
const source = fs.readFileSync(sourcePath, 'utf8');
const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const content = title => ({brief:'synthetic',title,description:'synthetic',category:'',tags:'',price:'',license:''});
const draft = (title,version=1,extra={}) => ({draft_id:'synthetic-draft',version,content:{...content(title),...extra},updated_at:'synthetic'});
const deferred = () => {let resolve,reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject};};
const flush = async () => {for(let i=0;i<16;i++) await Promise.resolve();};
const act = async fn => React.act(async () => {await fn?.();await flush();});
const watch = promise => {promise.catch(()=>{});return promise;};
async function setup() {
  let session=0,actor='A',sequence=0,store,readImpl=async()=>draft(actor),saveImpl=async(fields,version)=>({...draft(fields.title,version+1),content:fields});
  const listeners=new Set(),calls=[],reads=[],frames=[];
  const ports={
    react:React,'react/jsx-runtime':jsx,
    '@/lib/auth-session-owner':{authSessionOwner:()=>session,isAuthSessionOwner:id=>id===session,assertAuthSessionOwner:id=>{if(id!==session)throw Error('Authentication operation superseded');}},
    '@/store/auth':{useAuthStore:{subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);}}},
    '@/api/sellerListingDraft':{
      readListingDraft:signal=>{reads.push({actor,session});return readImpl(signal);},
      saveListingDraft:(fields,version,id)=>{calls.push({actor,session,fields,version,id});return saveImpl(fields,version,id);},
    },
  };
  const sandboxModule={exports:{}};
  vm.runInNewContext(js,{module:sandboxModule,exports:sandboxModule.exports,require:name=>{if(!Object.hasOwn(ports,name))throw Error('Denied module '+name);return ports[name];},AbortController,crypto:{randomUUID:()=>`synthetic-id-${++sequence}`},console},{filename:'actual-SellerListingDraftStore.tsx'});
  function Capture(){store=sandboxModule.exports.useSellerListingDraft();frames.push({loaded:store.loaded,title:store.draft?.content.title,pending:store.selectionSavePending});return null;}
  let root,element;
  const mount=async()=>{element=document.createElement('div');document.body.appendChild(element);root=createRoot(element);await act(()=>root.render(React.createElement(sandboxModule.exports.SellerListingDraftProvider,{enabled:true,sampleCapability:true},React.createElement(Capture))));};
  const unmount=async()=>{if(root){await act(()=>root.unmount());element.remove();root=null;}};
  return {get store(){return store;},calls,reads,frames,mount,unmount,
    read:fn=>{readImpl=fn;},save:fn=>{saveImpl=fn;},
    change:(next,notify=true)=>{session++;actor=next;if(notify)listeners.forEach(listener=>listener());},
    notify:()=>listeners.forEach(listener=>listener()),
    refresh:()=>listeners.forEach(listener=>listener()),
  };
}
const results=[];
async function test(name,fn){let h;try{h=await setup();await fn(h);results.push({name,passed:true,calls:h.calls,reads:h.reads});}catch(error){results.push({name,passed:false,error:error.stack,calls:h?.calls,reads:h?.reads});}finally{await h?.unmount();}}
async function queued(h){await h.mount();assert.equal(h.store.loaded,true);const response=deferred();h.save(()=>response.promise);let first,second;await act(()=>{first=watch(h.store.saveListingFields(content('A-first')));second=watch(h.store.saveListingFields(content('A-queued')));});assert.equal(h.calls.length,1);h.save(async(fields,version)=>({...draft(fields.title,version+1),content:fields}));return {response,first,second};}
(async()=>{
  for(const mode of ['departure','remount','refresh']) await test('same lifecycle queue survives '+mode,async h=>{
    const q=await queued(h);if(mode!=='refresh')await h.unmount();if(mode==='remount')await h.mount();if(mode==='refresh')await act(()=>h.refresh());
    await act(async()=>{q.response.resolve(draft('A-first',2));await Promise.all([q.first,q.second]);});assert.equal(h.calls.length,2);assert.equal(h.calls[1].version,2);assert.equal(h.calls[1].actor,'A');
  });
  for(const mode of ['B','logout then A','coalesced A-B-A']) await test('retired queue rejected: '+mode,async h=>{
    const q=await queued(h);await h.unmount();
    if(mode==='B')h.change('B');else {h.change(mode==='logout then A'?'logged-out':'B',false);h.change('A',false);}
    await act(async()=>{q.response.resolve(draft('A-first',2));const settled=await Promise.allSettled([q.first,q.second]);assert(settled.every(x=>x.status==='rejected'));});assert.equal(h.calls.length,1);
    await h.mount();assert.equal(h.store.loaded,true);assert.equal(h.store.draft.content.title,mode==='B'?'B':'A');
  });
  await test('mounted coalesced transition resets all owner-local state',async h=>{
    await h.mount();const old=h.store;await act(()=>{old.beginSelectionSave();old.setVisibleSampleIndices([9]);h.change('B',false);h.change('A',false);h.notify();});
    assert.equal(h.store.loaded,true);assert.equal(h.store.selectionSavePending,false);assert.equal(h.store.selectionSaveFailed,false);assert.deepEqual(Array.from(h.store.sampleIndices),[]);
    await act(()=>old.finishSelectionSave(false));assert.equal(h.store.selectionSaveFailed,false);
    await assert.rejects(old.saveListingFields(content('retired')));assert.equal(h.calls.length,0);
  });
  for(const rejected of [false,true]) await test('stale selection completion cannot settle B pending save: '+rejected,async h=>{
    await h.mount();const a=deferred(),b=deferred();h.save(()=>a.promise);let savingA;await act(()=>{savingA=watch(h.store.saveSamples([1]));});
    await act(()=>h.change('B'));assert.equal(h.store.draft.content.title,'B');assert.equal(h.store.selectionSavePending,false);
    h.save(()=>b.promise);let savingB;await act(()=>{savingB=watch(h.store.saveSamples([2]));});assert.equal(h.calls[1].version,1);
    await act(async()=>{if(rejected)a.reject(Error('synthetic failure'));else a.resolve(draft('stale A',80));await Promise.allSettled([savingA]);});
    assert.equal(h.store.draft.content.title,'B');assert.equal(h.store.selectionSavePending,true);assert.equal(h.store.selectionSaveFailed,false);
    await act(async()=>{b.reject(Error('unknown outcome'));await Promise.allSettled([savingB]);});const pendingId=h.calls[1].id;
    h.save(async fields=>({...draft('B',2),content:fields}));await act(()=>h.store.saveSamples([2]));assert.equal(h.calls[2].id,pendingId);assert.equal(h.calls[2].version,1);assert.equal(h.store.selectionSavePending,false);assert.equal(h.store.selectionSaveFailed,false);
  });
  for(const kind of ['initial','reload','queued reload']) await test('retired '+kind+' read cannot publish or invoke callback',async h=>{
    const response=deferred();let reading,callback=0,saveResponse,saving;
    if(kind==='initial'){h.read(()=>response.promise);await h.mount();}
    else {await h.mount();if(kind==='queued reload'){saveResponse=deferred();h.save(()=>saveResponse.promise);await act(()=>{saving=watch(h.store.saveListingFields(content('A-save')));});}h.read(()=>response.promise);await act(()=>{reading=watch(h.store.reload(undefined,()=>callback++));});}
    const readsBefore=h.reads.length;h.read(async()=>draft('B',4));await act(()=>h.change('B'));assert.equal(h.store.loaded,true);assert.equal(h.store.draft.content.title,'B');
    await act(async()=>{response.resolve(draft('stale A',99));if(saveResponse)saveResponse.resolve(draft('A-save',2));await Promise.allSettled([reading,saving].filter(Boolean));});
    assert.equal(h.store.draft.content.title,'B');assert.equal(callback,0);assert.equal(h.reads.length,readsBefore+1);
  });
  await test('new owner does not offer A draft, samples or licence as loaded while B waits',async h=>{
    h.read(async()=>draft('A',7,{sample_decision:'member_files',sample_object_indices:[5],license_selection:{synthetic:'A'}}));await h.mount();
    const response=deferred();h.read(()=>response.promise);await act(()=>h.change('B'));assert.equal(h.store.loaded,false);assert.equal(h.store.draft,null);assert.deepEqual(Array.from(h.store.sampleIndices),[]);
    await assert.rejects(h.store.saveListingFields(content('too soon')),error=>error.name==='DraftNotLoadedError');assert.equal(h.calls.length,0);
    await act(()=>response.resolve(draft('B',1)));assert.equal(h.store.loaded,true);
  });
  await test('initial read failure and explicit retry recover',async h=>{
    h.read(async()=>{throw Error('offline');});await h.mount();assert.equal(h.store.error,true);assert.equal(h.store.loaded,false);
    h.read(async()=>null);await act(()=>h.store.retry());assert.equal(h.store.loaded,true);assert.equal(h.store.error,false);assert.equal(h.store.draft,null);
    await act(()=>h.store.saveListingFields(content('new')));assert.equal(h.calls[0].version,0);
  });
  await test('unknown outcome retries exact request; explicit baseline conflict does not advance version',async h=>{
    await h.mount();h.save(async()=>{throw Error('unknown outcome');});await act(async()=>{await assert.rejects(h.store.saveListingFields(content('retry')));});
    h.save(async fields=>({...draft(fields.title,2),content:fields}));await act(()=>h.store.saveListingFields(content('retry')));assert.equal(h.calls[0].id,h.calls[1].id);assert.equal(h.calls[1].version,1);
    h.save(async()=>{throw Error('version conflict');});await act(async()=>{await assert.rejects(h.store.saveListingFields(content('conflict'),0));});assert.equal(h.calls[2].version,0);assert.equal(h.store.draft.version,2);
    h.save(async fields=>({...draft(fields.title,3),content:fields}));await act(()=>h.store.saveListingFields(content('next')));assert.equal(h.calls[3].version,2);assert.notEqual(h.calls[3].id,h.calls[2].id);
  });
  for(const value of [null,draft('older',0),draft('equal',2),draft('newer',3)]) await test('overlapping reload/save reconciliation: '+(value?.content.title??'null'),async h=>{
    await h.mount();const response=deferred();h.read(()=>response.promise);let reading,callbacks=0;await act(()=>{reading=watch(h.store.reload(undefined,()=>callbacks++));});await act(()=>h.store.saveListingFields(content('saved')));
    await act(async()=>{response.resolve(value);await reading;});const stale=!value||value.version<2;assert.equal(h.store.draft.content.title,stale?'saved':value.content.title);assert.equal(callbacks,stale?0:1);
  });
  for(const value of [null,draft('reset',0)]) await test('fresh intentional reset accepted: '+(value?.content.title??'null'),async h=>{
    await h.mount();await act(()=>h.store.saveListingFields(content('saved')));h.read(async()=>value);await act(()=>h.store.reload());assert.equal(h.store.draft?.version,value?.version);
    await act(()=>h.store.saveListingFields(content('after reset')));assert.equal(h.calls[1].version,value?.version??0);
  });
  await test('aborted reload skips publication and source callback',async h=>{
    await h.mount();const response=deferred(),controller=new AbortController();let reading,callbacks=0;h.read(()=>response.promise);await act(()=>{reading=watch(h.store.reload(controller.signal,()=>callbacks++));});controller.abort();await act(async()=>{response.resolve(draft('aborted',9));await reading;});assert.equal(h.store.draft.content.title,'A');assert.equal(callbacks,0);
  });
  await test('overlapping selection saves account for pending and recover failure',async h=>{
    await h.mount();const response=deferred();h.save(()=>response.promise);let a,b;await act(()=>{a=watch(h.store.saveSamples([1]));b=watch(h.store.saveSamples([2]));});assert.equal(h.store.selectionSavePending,true);
    h.save(async fields=>({...draft('selected',2),content:fields}));await act(async()=>{response.reject(Error('offline'));await Promise.allSettled([a,b]);});assert.equal(h.store.selectionSavePending,false);assert.equal(h.store.selectionSaveFailed,false);assert.deepEqual(Array.from(h.store.sampleIndices),[2]);
  });
  console.log(JSON.stringify({sourcePath,node:process.version,react:React.version,typescript:ts.version,cases:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results,limits:'Selected actual store TSX only. Fake lifecycle/notifications/read/write/UUID ports; no app/auth/client import closure, Vitest/whole test modules, actual account/network/provider/DB/key/business crypto operations. Source/fake-port evidence only; runtime/customer acceptance and Tier3 reviews pending.'},null,2));
  if(results.some(x=>!x.passed))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
