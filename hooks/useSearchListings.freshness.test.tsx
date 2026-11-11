// @vitest-environment jsdom
import {renderHook,act,cleanup} from '@testing-library/react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {useSearchListings} from './useSearchListings';
const query=vi.hoisted(()=>({useInfiniteQuery:vi.fn(),useQueryClient:vi.fn()}));
vi.mock('@tanstack/react-query',()=>query);
beforeEach(() => { query.useQueryClient.mockReturnValue({}); });
afterEach(()=>{cleanup();vi.useRealTimers();vi.resetAllMocks();});
it('bounds retained current search results when refresh repeatedly fails',()=>{
 vi.useFakeTimers({toFake:['Date','setInterval','clearInterval','performance']});vi.setSystemTime(1000000);
 const state={data:{pages:[{result:[{id:'synthetic',slug:'synthetic',status:'published'}],observedAt:Date.now(),observedAtMonotonic:performance.now()}]},dataUpdatedAt:Date.now(),isError:false,error:null};
 query.useInfiniteQuery.mockReturnValue(state);
 const hook=renderHook(()=>useSearchListings({}));
 expect(hook.result.current.items).toHaveLength(1);
 expect(query.useInfiniteQuery.mock.calls[0][0]).toMatchObject({staleTime:0,refetchInterval:300000,refetchOnWindowFocus:true,refetchOnReconnect:true});
 act(()=>vi.advanceTimersByTime(10*60_000));
 expect(hook.result.current.items).toEqual([]);
 expect(hook.result.current.isError).toBe(true);
 state.data.pages[0].observedAt=Date.now();state.data.pages[0].observedAtMonotonic=performance.now();hook.rerender();
 expect(hook.result.current.items).toHaveLength(1);
});

it('adding a fresh page cannot renew older cached cards',()=>{
 vi.useFakeTimers({toFake:['Date','setInterval','clearInterval','performance']});vi.setSystemTime(1000000);
 const state={data:{pages:[{result:[{id:'old'}],observedAt:Date.now()-11*60_000,observedAtMonotonic:performance.now()-11*60_000},{result:[{id:'new'}],observedAt:Date.now(),observedAtMonotonic:performance.now()}]},dataUpdatedAt:Date.now(),isError:false,error:null};
 query.useInfiniteQuery.mockReturnValue(state);
 const hook=renderHook(()=>useSearchListings({}));
 expect(hook.result.current.items).toEqual([]);expect(hook.result.current.isError).toBe(true);
});
