import {expect,it,vi} from 'vitest';
import type {InternalAxiosRequestConfig} from 'axios';
import {api} from './client';
import {readLatestSellerSigner} from './sellerLegalIdentity';

it('sends the signer lookup to the exact backend GET route',async()=>{
  const originalAdapter=api.defaults.adapter;
  const adapter=vi.fn(async (config:InternalAxiosRequestConfig)=>({
    config,status:200,statusText:'OK',headers:{},data:{signer_name:'Sam Seller',signer_title:'Director'},
  }));
  api.defaults.adapter=adapter;
  const {signal}=new AbortController();
  try {
    expect(await readLatestSellerSigner(signal)).toEqual({signer_name:'Sam Seller',signer_title:'Director'});
    expect(adapter).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      method:'get',url:'/seller-workspace/license-signer',signal,
    }));
  } finally {
    api.defaults.adapter=originalAdapter;
  }
});
