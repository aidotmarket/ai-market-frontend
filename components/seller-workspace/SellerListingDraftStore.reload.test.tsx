// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {ListingDraftContent,SavedListingDraft} from "@/api/sellerListingDraft";
import SavedListingEditor from "./SavedListingEditor";
import {resetSellerListingDraftOwnerForTests,SellerListingDraftProvider,useSellerListingDraft} from "./SellerListingDraftStore";

const api=vi.hoisted(()=>({read:vi.fn(),save:vi.fn()}));
vi.mock("@/api/sellerListingDraft",()=>({readListingDraft:api.read,saveListingDraft:api.save}));
const content:ListingDraftContent={brief:"",title:"Sales",description:"Sales description",category:"",tags:"sales",price:"25",license:"",description_source_version:null};
const initial:SavedListingDraft={version:2,updated_at:"t2",content};
const saved:SavedListingDraft={version:3,updated_at:"t3",content:{...content,price:"30"}};
const onLoaded=vi.fn();
let signal:AbortSignal|undefined;
let reloading:Promise<SavedListingDraft|null>;
function deferred<T>(){
  let resolve!:(value:T)=>void;
  const promise=new Promise<T>(done=>{resolve=done;});
  return {promise,resolve};
}
function Consumer(){
  const store=useSellerListingDraft();
  return <><output data-testid="version">{store.draft?.version??"empty"}</output><output data-testid="price">{store.draft?.content.price??"empty"}</output>
    <output data-testid="loaded">{String(store.loaded)}</output><output data-testid="error">{String(store.error)}</output>
    <button onClick={()=>{reloading=store.reload(signal,onLoaded);}}>Reload draft</button><SavedListingEditor active/></>;
}
beforeEach(()=>{
  resetSellerListingDraftOwnerForTests();api.read.mockReset();api.save.mockReset();onLoaded.mockReset();signal=undefined;
  let id=0;
  vi.spyOn(globalThis.crypto,"randomUUID").mockImplementation(()=>`00000000-0000-4000-8000-${String(++id).padStart(12,"0")}`);
  vi.stubGlobal("fetch",vi.fn(()=>{throw new Error("Unexpected network request");}));
  api.read.mockResolvedValue(initial);
  api.save.mockImplementation(async(fields:ListingDraftContent,version:number)=>({version:version+1,updated_at:`t${version+1}`,content:fields}));
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
async function mount(){
  render(<SellerListingDraftProvider enabled sampleCapability={false}><Consumer/></SellerListingDraftProvider>);
  await screen.findByDisplayValue("Sales");expect(screen.getByTestId("version").textContent).toBe("2");
}
async function savePrice(){
  fireEvent.change(screen.getByLabelText("Your price (USD)"),{target:{value:"30"}});
  fireEvent.click(screen.getByRole("button",{name:"Save private draft"}));
  await waitFor(()=>expect(screen.getByTestId("version").textContent).toBe("3"));
  expect(api.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({price:"30"}),2,"00000000-0000-4000-8000-000000000001");
}
async function startRead(){
  const read=deferred<SavedListingDraft|null>();api.read.mockReturnValueOnce(read.promise);
  fireEvent.click(screen.getByRole("button",{name:"Reload draft"}));
  await waitFor(()=>expect(api.read).toHaveBeenCalledTimes(2));
  expect(api.read).toHaveBeenLastCalledWith(signal);
  return read;
}
async function finishRead(read:ReturnType<typeof deferred<SavedListingDraft|null>>,value:SavedListingDraft|null){
  let result!:SavedListingDraft|null;
  await act(async()=>{read.resolve(value);result=await reloading;});
  expect(api.read).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId("loaded").textContent).toBe("true");
  expect(screen.getByTestId("error").textContent).toBe("false");
  return result;
}
it("loads and saves normally without extra reads",async()=>{
  await mount();await savePrice();expect(api.read).toHaveBeenCalledOnce();
  expect((screen.getByLabelText("Your price (USD)") as HTMLInputElement).value).toBe("30");
});
it.each([initial,null])("preserves a committed save against an older in-flight reload (%j) and skips its source callback",async value=>{
  await mount();const read=await startRead();await savePrice();
  const result=await finishRead(read,value);
  expect(screen.getByTestId("version").textContent).toBe("3");expect(screen.getByTestId("price").textContent).toBe("30");
  expect((screen.getByLabelText("Your price (USD)") as HTMLInputElement).value).toBe("30");expect(onLoaded).not.toHaveBeenCalled();
  expect(result).toEqual(saved);
  // The editor must keep the committed baseline for its next edit, too.
  fireEvent.change(screen.getByLabelText("Tags"),{target:{value:"updated"}});
  fireEvent.click(screen.getByRole("button",{name:"Save private draft"}));
  await waitFor(()=>expect(api.save).toHaveBeenCalledTimes(2));
  expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({price:"30",tags:"updated"}),3,"00000000-0000-4000-8000-000000000002");
  await waitFor(()=>expect(screen.getByTestId("version").textContent).toBe("4"));
});
it.each([saved,{...saved,version:4,content:{...content,price:"35"}}])("accepts an overlapping read at the saved version or newer (%j)",async value=>{
  await mount();const read=await startRead();await savePrice();
  expect(await finishRead(read,value)).toEqual(value);expect(screen.getByTestId("version").textContent).toBe(String(value.version));
  expect(screen.getByTestId("price").textContent).toBe(value.content.price);expect(onLoaded).toHaveBeenCalledOnce();
  expect((screen.getByLabelText("Your price (USD)") as HTMLInputElement).value).toBe(value.content.price);
});
it.each([initial,null,{version:0,updated_at:"reset",content:{...content,title:"",price:""}}])("accepts a fresh reset after a save (%j)",async value=>{
  await mount();await savePrice();const read=await startRead();
  expect(await finishRead(read,value)).toEqual(value);expect(screen.getByTestId("version").textContent).toBe(String(value?.version??"empty"));
  expect(onLoaded).toHaveBeenCalledOnce();expect(api.save).toHaveBeenCalledOnce();
});
it("reconciles an external draft when no save overlaps",async()=>{
  await mount();const read=await startRead();const external={...saved,version:4};
  await finishRead(read,external);expect(screen.getByTestId("version").textContent).toBe("4");
  expect((screen.getByLabelText("Your price (USD)") as HTMLInputElement).value).toBe("30");expect(onLoaded).toHaveBeenCalledOnce();expect(api.save).not.toHaveBeenCalled();
});
it("ignores an aborted read even when it returns a newer draft",async()=>{
  await mount();const controller=new AbortController();signal=controller.signal;const read=await startRead();
  await savePrice();controller.abort();await finishRead(read,{...saved,version:4});
  expect(screen.getByTestId("version").textContent).toBe("3");expect(onLoaded).not.toHaveBeenCalled();
});
it("does not treat a failed save as a committed local revision",async()=>{
  await mount();const read=await startRead();api.save.mockRejectedValueOnce(new Error("offline"));
  fireEvent.change(screen.getByLabelText("Your price (USD)"),{target:{value:"30"}});
  fireEvent.click(screen.getByRole("button",{name:"Save private draft"}));await screen.findByText(/Saving could not be confirmed/);
  expect(api.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({price:"30"}),2,"00000000-0000-4000-8000-000000000001");
  // An uncertain attempt is not a commit, but the older read must preserve its retry identity.
  expect(await finishRead(read,null)).toEqual(initial);
  expect(screen.getByTestId("version").textContent).toBe("2");expect(screen.getByTestId("price").textContent).toBe("25");
  expect(onLoaded).not.toHaveBeenCalled();expect(api.save).toHaveBeenCalledOnce();
  expect((screen.getByLabelText("Your price (USD)") as HTMLInputElement).value).toBe("30");
  expect(screen.getByText(/You have unsaved changes/)).toBeTruthy();
  const retry=deferred<SavedListingDraft>();api.save.mockReturnValueOnce(retry.promise);
  fireEvent.click(screen.getByRole("button",{name:"Save private draft"}));
  await waitFor(()=>expect(api.save).toHaveBeenCalledTimes(2));
  expect(api.save).toHaveBeenLastCalledWith(expect.objectContaining({price:"30"}),2,"00000000-0000-4000-8000-000000000001");
  expect(api.save.mock.calls[1]).toEqual(api.save.mock.calls[0]);
  expect(screen.getByTestId("version").textContent).toBe("2");expect(screen.getByTestId("price").textContent).toBe("25");
  await act(async()=>{retry.resolve(saved);});
  await waitFor(()=>expect(screen.getByTestId("version").textContent).toBe("3"));
  expect(screen.getByTestId("price").textContent).toBe("30");
  expect((screen.getByLabelText("Your price (USD)") as HTMLInputElement).value).toBe("30");
  expect(screen.getByText(/Draft saved to your account/)).toBeTruthy();
  expect(onLoaded).not.toHaveBeenCalled();expect(api.save).toHaveBeenCalledTimes(2);expect(api.read).toHaveBeenCalledTimes(2);
});
