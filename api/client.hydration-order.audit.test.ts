import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
function deferred<T>(){let resolve!:(x:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve};}
beforeEach(()=>{vi.resetModules();vi.stubGlobal('window',{location:{pathname:'/auth/oauth/google/callback',search:'',hash:'',href:'/auth/oauth/google/callback'}})});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()});
describe('R536 background hydration after admitted OAuth',()=>{
it.each([401,403])('does not reject successful OAuth after hydration %s',async status=>{
const {api}=await import('./client');const auth=await import('./auth');const {useAuthStore:store}=await import('@/store/auth');
api.defaults.adapter=async()=>{throw new Error('No real API transport')};
const pending=deferred<{access_token:string;token_type:string}>();vi.spyOn(auth,'oauthCallback').mockReturnValue(pending.promise);
vi.spyOn(auth,'getMe').mockResolvedValue({id:'B'} as never);
const config={headers:{}} as InternalAxiosRequestConfig;
vi.spyOn(axios,'post').mockRejectedValue(new AxiosError('Fake refusal','ERR_BAD_RESPONSE',config,undefined,{config,status,statusText:'Refused',data:{},headers:{}}));
const login=store.getState().oauthLogin('google','fake','fake','fake').then(()=>({ok:true}),()=>({ok:false}));
await store.getState().hydrate();
pending.resolve({access_token:'fake-B',token_type:'bearer'});
expect(await login).toEqual({ok:true});expect(store.getState()).toMatchObject({token:'fake-B',user:{id:'B'},isAuthenticated:true});
});
});
