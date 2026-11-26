// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {GuidedListingFlow,useListingFlow} from "./GuidedListingFlow";
import SavedWorkspaceData from "./SavedWorkspaceData";
import {SellerListingDraftProvider,resetSellerListingDraftOwnerForTests,useSellerListingDraft} from "./SellerListingDraftStore";
import {RecoverableWorkspacePanel} from "./WorkspacePanel";
import {categoryRows,emptyGuidedDraft,guidedCapabilities,guidedConnection,guidedObjects} from "@/tests/guidedListingFixture";
const api=vi.hoisted(()=>({draft:vi.fn(),source:vi.fn(),save:vi.fn(),objects:vi.fn(),currentDraftId:null as string|null}));
vi.mock("@/api/sellerListingDraft",()=>({readListingDraft:api.draft}));
vi.mock("@/api/sellerListingSource",()=>({readListingSource:async(id?:string)=>({source:await api.source(id),current_draft_id:id??api.currentDraftId}),saveListingSource:async(...args:unknown[])=>({source:await api.save(...args),current_draft_id:args[3]??"created"}),readSellerCategories:vi.fn(async()=>categoryRows)}));
vi.mock("@/api/sellerWorkspace",async original=>({...await original<typeof import("@/api/sellerWorkspace")>(),listWorkspaceObjects:api.objects}));
vi.mock("@/api/capabilities",()=>({getCapabilities:vi.fn().mockResolvedValue({})}));
const a={draft_id:"A",authority_version_id:"authority-a",version:1,content:emptyGuidedDraft,updated_at:""};
const b={...a,draft_id:"B",authority_version_id:"authority-b"};
const extra={...guidedObjects[0],key:"weekly/b.csv",etag:"b"};
const source=(objects=guidedObjects)=>({version:4,connection_current:true,content:{connection_id:guidedConnection.id,connection_version:1,version_mode:"current",objects}});
const caps={...guidedCapabilities,review:{enabled:false,status:"unavailable" as const,reason:"disabled"},listing_licenses:false};
function SourceStatus(){const flow=useListingFlow()!;return <output data-testid="source-state">{flow.sourceLoaded?JSON.stringify(flow.source):"loading"}</output>;}
function mount(){render(<SellerListingDraftProvider enabled sampleCapability={false}><GuidedListingFlow capabilities={caps} connections={[guidedConnection]} view="data" navigate={vi.fn()}><SourceStatus/><SavedWorkspaceData enabled connections={[guidedConnection]}/></GuidedListingFlow></SellerListingDraftProvider>);}
beforeEach(()=>{api.currentDraftId=null;resetSellerListingDraftOwnerForTests();api.draft.mockReset().mockResolvedValue(a);api.source.mockReset().mockImplementation(async id=>source((id??api.currentDraftId)==="B"?[extra]:guidedObjects));api.objects.mockReset().mockResolvedValue({objects:[...guidedObjects,extra],next_cursor:null});api.save.mockReset();});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it.each([["pending",null],["failed",null],["pending","B"],["failed","B"]] as const)("admits no source PUT while the draft GET is %s and the source pointer is %s",async(state,pointer)=>{
 api.currentDraftId=pointer;
 let reject!:(reason:Error)=>void;
 if(state==="pending")api.draft.mockImplementationOnce(()=>new Promise((_,fail)=>{reject=fail;}));
 else api.draft.mockRejectedValueOnce(new Error("draft failed"));
 // An omitted target would silently save A selections into B at the same version.
 let current=source([extra]);
 api.save.mockImplementation(async(content,version,_key,id)=>{expect(version).toBe(4);expect(id).toBe("B");current={...current,content};return {...current,version:5};});
 mount();await waitFor(()=>expect(api.source).toHaveBeenCalledWith(undefined));
 await waitFor(()=>expect(screen.getByTestId("source-state").textContent).toBe(pointer?"loading":JSON.stringify(source())));
 if(state==="pending")expect(await screen.findByText(pointer?"Loading your saved file selection…":"Loading your saved draft…")).toBeTruthy();
 else await screen.findByText(/Your saved draft could not be loaded/);
 expect(screen.queryByRole("checkbox",{name:"Select weekly/sales.csv"})).toBeNull();
 expect(screen.queryByRole("button",{name:"Save selected files"})).toBeNull();
 if(state==="pending")await act(async()=>{reject(new Error("draft offline"));});

 await screen.findByText(/Your saved draft could not be loaded/);
 expect(api.save).not.toHaveBeenCalled();expect(current.content.objects).toEqual([extra]);
 api.draft.mockResolvedValueOnce(b);
 fireEvent.click(screen.getByRole("button",{name:"Try loading draft again"}));
 const selected=await screen.findByRole("checkbox",{name:"Select weekly/b.csv"});
 expect((selected as HTMLInputElement).checked).toBe(true);
 expect(api.source).toHaveBeenCalledWith("B");
 expect(api.save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("checkbox",{name:"Select weekly/sales.csv"}));
 fireEvent.click(screen.getByRole("button",{name:"Next: Describe and price →"}));
 await waitFor(()=>expect(api.save).toHaveBeenCalledOnce());expect(api.save.mock.calls[0][3]).toBe("B");
});
it("keeps superseded source guidance above the keyed editor after B files load and clears it after B saves",async()=>{
 api.save.mockRejectedValueOnce({isAxiosError:true,response:{status:409,data:{detail:{code:"DRAFT_SUPERSEDED"}}}}).mockImplementation(async content=>({...source(),version:5,content}));
 mount();await screen.findByRole("checkbox",{name:"Select weekly/sales.csv"});
 api.draft.mockResolvedValueOnce(b);
 fireEvent.click(screen.getByRole("checkbox",{name:"Select weekly/b.csv"}));
 fireEvent.click(screen.getByRole("button",{name:"Next: Describe and price →"}));
 await waitFor(()=>expect(api.source).toHaveBeenCalledWith("B"));
 await waitFor(()=>expect((screen.getByRole("checkbox",{name:"Select weekly/b.csv"}) as HTMLInputElement).checked).toBe(true));
 expect((screen.getByRole("checkbox",{name:"Select weekly/sales.csv"}) as HTMLInputElement).checked).toBe(false);
 expect(screen.getByRole("alert").textContent).toContain("This import was replaced by a newer import or a new listing");
 expect(api.save.mock.calls[0][3]).toBe("A");
 fireEvent.click(screen.getByRole("checkbox",{name:"Select weekly/sales.csv"}));
 fireEvent.click(screen.getByRole("button",{name:"Next: Describe and price →"}));
 await waitFor(()=>expect(api.save).toHaveBeenCalledTimes(2));
 expect(api.save.mock.calls[1][3]).toBe("B");
 await waitFor(()=>expect(screen.queryByRole("alert")).toBeNull());
});

function deferred<T>(){
 let resolve!:(value:T)=>void;
 let reject!:(reason:unknown)=>void;
 const promise=new Promise<T>((done,fail)=>{resolve=done;reject=fail;});
 return {promise,resolve,reject};
}

it.each(["success","superseded","pointer refusal"])("ignores a late A PUT %s after the public source accepts B and the panel retries",async outcome=>{
 const late=deferred<ReturnType<typeof source>>();
 const navigate=vi.fn();
 api.save.mockReturnValueOnce(late.promise);
 function Data({fail}:{fail:boolean}){
  if(fail)throw new Error("Mock panel failure");
  return <SavedWorkspaceData enabled connections={[guidedConnection]}/>;
 }
 function SourceControls(){
  const flow=useListingFlow()!;
  const store=useSellerListingDraft();
  return <><output data-testid="source-pointer">{flow.sourceCurrentDraftId}</output>
   <output data-testid="selection-status">{store.selectionSavePending?"pending":store.selectionSaveFailed?"failed":"idle"}</output>
   <button onClick={()=>void flow.reloadSource()}>Reload saved source</button></>;
 }
 const workspace=(enabled:boolean,fail=false)=><SellerListingDraftProvider enabled={enabled} sampleCapability>
  <GuidedListingFlow capabilities={caps} connections={[guidedConnection]} view="data" navigate={navigate}>
   <SourceControls/><RecoverableWorkspacePanel active><Data fail={fail}/></RecoverableWorkspacePanel>
  </GuidedListingFlow>
 </SellerListingDraftProvider>;
 const {rerender}=render(workspace(true));
 await screen.findByRole("checkbox",{name:"Select weekly/sales.csv"});
 fireEvent.click(screen.getByRole("checkbox",{name:"Select weekly/b.csv"}));
 fireEvent.click(screen.getByRole("button",{name:"Next: Describe and price →"}));
 expect(api.save).toHaveBeenCalledOnce();
 expect(api.save.mock.calls[0][3]).toBe("A");

 api.currentDraftId="B";
 rerender(workspace(false));
 expect((await screen.findByRole("checkbox",{name:"Select weekly/b.csv"}) as HTMLInputElement).checked).toBe(true);
 expect(screen.getByTestId("source-pointer").textContent).toBe("B");
 const draftReads=api.draft.mock.calls.length;
 const sourceReads=api.source.mock.calls.length;
 await act(async()=>{
  if(outcome==="success")late.resolve({...source(),version:5});
  else late.reject({isAxiosError:true,response:{status:409,data:{detail:{code:outcome==="superseded"?"DRAFT_SUPERSEDED":"CURRENT_DRAFT_CHANGED"}}}});
 });
 expect(api.draft).toHaveBeenCalledTimes(draftReads);
 expect(api.source).toHaveBeenCalledTimes(sourceReads);
 vi.spyOn(console,"error").mockImplementation(()=>{});
 rerender(workspace(false,true));
 rerender(workspace(false));
 fireEvent.click(screen.getByRole("button",{name:"Retry this step"}));
 expect((await screen.findByRole("checkbox",{name:"Select weekly/b.csv"}) as HTMLInputElement).checked).toBe(true);
 expect((screen.getByRole("checkbox",{name:"Select weekly/sales.csv"}) as HTMLInputElement).checked).toBe(false);
 expect(screen.getByTestId("source-pointer").textContent).toBe("B");
 expect(screen.queryByRole("alert")).toBeNull();
 expect(screen.getByTestId("selection-status").textContent).toBe("idle");
 expect(navigate).not.toHaveBeenCalled();
 expect(api.save).toHaveBeenCalledOnce();
 api.source.mockResolvedValueOnce({...source([guidedObjects[0]]),version:6});
 fireEvent.click(screen.getByRole("button",{name:"Reload saved source"}));
 expect((await screen.findByRole("checkbox",{name:"Select weekly/sales.csv"}) as HTMLInputElement).checked).toBe(true);
 expect(screen.getByTestId("source-pointer").textContent).toBe("B");
 expect(api.draft).toHaveBeenCalledTimes(draftReads);
 expect(api.save).toHaveBeenCalledOnce();
});

it("publishes selection completion after re-enable while withholding A until the fresh B read completes",async()=>{
 let store!:ReturnType<typeof useSellerListingDraft>;
 function Capture(){store=useSellerListingDraft();return null;}
 const workspace=(enabled:boolean)=><SellerListingDraftProvider enabled={enabled} sampleCapability={false}>
  <GuidedListingFlow capabilities={caps} connections={[guidedConnection]} view="data" navigate={vi.fn()}><Capture/></GuidedListingFlow>
 </SellerListingDraftProvider>;
 const {rerender}=render(workspace(true));
 await waitFor(()=>expect(api.source).toHaveBeenCalledWith("A"));
 const old=store;
 act(()=>old.beginSelectionSave());
 rerender(workspace(false));
 api.source.mockClear();
 const fresh=deferred<typeof b>();
 api.draft.mockReturnValueOnce(fresh.promise);
 rerender(workspace(true));
 await waitFor(()=>expect(api.draft).toHaveBeenCalledTimes(2));
 expect(store.selectionSavePending).toBe(true);
 expect(store.draft).toBeNull();
 await act(async()=>old.finishSelectionSave(true));
 expect(store.selectionSavePending).toBe(false);
 expect(store.loaded).toBe(false);
 expect(store.draft).toBeNull();
 expect(api.source).not.toHaveBeenCalledWith("A");
 await act(async()=>fresh.resolve(b));
 expect(store.draft).toEqual(b);
 expect(store.loaded).toBe(true);
 expect(api.source).toHaveBeenCalledWith("B");
});

it("keeps the newer save when an older PUT completes after a panel remount",async()=>{
 const older=deferred<ReturnType<typeof source>>();
 const newer=deferred<ReturnType<typeof source>>();
 api.save.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
 const navigate=vi.fn();
 const workspace=(attempt:number)=><SellerListingDraftProvider enabled sampleCapability={false}>
  <GuidedListingFlow capabilities={caps} connections={[guidedConnection]} view="data" navigate={navigate}>
   <SourceStatus/><SavedWorkspaceData key={attempt} enabled connections={[guidedConnection]}/>
  </GuidedListingFlow>
 </SellerListingDraftProvider>;
 const {rerender}=render(workspace(0));
 const selectAndSave=async()=>{
  fireEvent.click(await screen.findByRole("checkbox",{name:"Select weekly/b.csv"}));
  fireEvent.click(screen.getByRole("button",{name:"Next: Describe and price →"}));
 };
 await selectAndSave();
 rerender(workspace(1));
 await selectAndSave();
 expect(api.save).toHaveBeenCalledTimes(2);
 const saved={...source([extra]),version:6};
 await act(async()=>newer.resolve(saved));
 expect(screen.getByTestId("source-state").textContent).toBe(JSON.stringify(saved));
 const draftReads=api.draft.mock.calls.length;
 await act(async()=>older.resolve({...source(),version:5}));
 expect(screen.getByTestId("source-state").textContent).toBe(JSON.stringify(saved));
 expect(api.draft).toHaveBeenCalledTimes(draftReads);
 expect(api.save).toHaveBeenCalledTimes(2);
 expect(navigate).toHaveBeenCalledOnce();
});

it("requires a fresh source read after a remounted panel's overlapping save conflicts",async()=>{
 const first=deferred<ReturnType<typeof source>>();
 const second=deferred<ReturnType<typeof source>>();
 const navigate=vi.fn();
 api.save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
 const workspace=(attempt:number)=><SellerListingDraftProvider enabled sampleCapability={false}>
  <GuidedListingFlow capabilities={caps} connections={[guidedConnection]} view="data" navigate={navigate}>
   <SourceStatus/><SavedWorkspaceData key={attempt} enabled connections={[guidedConnection]}/>
  </GuidedListingFlow>
 </SellerListingDraftProvider>;
 const {rerender}=render(workspace(0));
 const next=()=>fireEvent.click(screen.getByRole("button",{name:"Next: Describe and price →"}));
 fireEvent.click(await screen.findByRole("checkbox",{name:"Select weekly/sales.csv"}));
 fireEvent.click(screen.getByRole("checkbox",{name:"Select weekly/b.csv"}));
 next();
 expect(api.save).toHaveBeenCalledOnce();

 // The first PUT commits before the second checks its precondition.
 const committed={...source([extra]),version:5};
 api.source.mockResolvedValue(committed);
 rerender(workspace(1));
 fireEvent.click(await screen.findByRole("checkbox",{name:"Select weekly/b.csv"}));
 next();
 expect(api.save.mock.calls.map(call=>[call[1],call[3]])).toEqual([[4,"A"],[4,"A"]]);
 expect(api.save.mock.calls[0][0].objects).toMatchObject([{key:"weekly/b.csv"}]);
 expect(api.save.mock.calls[1][0].objects).toHaveLength(2);
 await act(async()=>second.reject({isAxiosError:true,response:{status:409,data:{detail:"Source selection changed. Refresh the files before saving again."}}}));
 await act(async()=>first.resolve(committed));
 expect(navigate).not.toHaveBeenCalled();

 rerender(workspace(2));
 expect(screen.queryByText(/File selection saved to your account/)).toBeNull();
 const reload=await screen.findByRole("button",{name:"Reload saved files"});
 expect(api.save).toHaveBeenCalledTimes(2);
 fireEvent.click(reload);
 expect((await screen.findByRole("checkbox",{name:"Select weekly/b.csv"}) as HTMLInputElement).checked).toBe(true);
 expect((screen.getByRole("checkbox",{name:"Select weekly/sales.csv"}) as HTMLInputElement).checked).toBe(false);
 expect(screen.getByTestId("source-state").textContent).toBe(JSON.stringify(committed));
 expect(await screen.findByText(/File selection saved to your account/)).toBeTruthy();
 expect(api.save).toHaveBeenCalledTimes(2);
 expect(navigate).not.toHaveBeenCalled();
});

it.each([false,true])("updates a remounted panel's saved baseline when its predecessor commits, with newer edits=%s",async edit=>{
 const first=deferred<ReturnType<typeof source>>();
 api.save.mockReturnValueOnce(first.promise);
 const workspace=(attempt:number)=><SellerListingDraftProvider enabled sampleCapability={false}>
  <GuidedListingFlow capabilities={caps} connections={[guidedConnection]} view="data" navigate={vi.fn()}>
   <SavedWorkspaceData key={attempt} enabled connections={[guidedConnection]}/>
  </GuidedListingFlow>
 </SellerListingDraftProvider>;
 const {rerender}=render(workspace(0));
 const sales=()=>screen.getByRole("checkbox",{name:"Select weekly/sales.csv"}) as HTMLInputElement;
 const added=()=>screen.findByRole("checkbox",{name:"Select weekly/b.csv"}) as Promise<HTMLInputElement>;
 fireEvent.click(await added());
 fireEvent.click(sales());
 fireEvent.click(screen.getByRole("button",{name:"Save selected files"}));
 fireEvent.click(screen.getByRole("button",{name:"Confirm selection"}));
 expect(api.save).toHaveBeenCalledOnce();

 rerender(workspace(1));
 const extraBox=await added();
 expect((screen.getByRole("button",{name:"Next: Describe and price →"}) as HTMLButtonElement).disabled).toBe(true);
 if(edit)fireEvent.click(extraBox);
 await act(async()=>first.resolve({...source([extra]),version:5}));
 expect(sales().checked).toBe(edit);
 expect(extraBox.checked).toBe(true);
 expect(Boolean(screen.queryByText(/File selection saved to your account/))).toBe(!edit);
 expect(api.save).toHaveBeenCalledOnce();
});
