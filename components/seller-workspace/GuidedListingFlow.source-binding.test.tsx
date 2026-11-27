// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {GuidedListingFlow,useListingFlow} from "./GuidedListingFlow";
import SavedWorkspaceData from "./SavedWorkspaceData";
import {SellerListingDraftProvider,resetSellerListingDraftOwnerForTests} from "./SellerListingDraftStore";
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
