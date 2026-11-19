// @vitest-environment jsdom
// This regression harness depends on private Next router APIs and module resolution.
// Recheck this setup on Next upgrades; an internal API change can break it without a product regression.
// Adapted from CC round-2 probes: real Next AppRouter, including history effects.
import React from 'react';
import {createRequire} from 'node:module';
import {act,cleanup,render,waitFor} from '@testing-library/react';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {useHandoffBoundary,captureHandoff,clearHandoff} from '@/lib/vectoraizHandoff';
import type {FlightRouterState,CacheNodeSeedData} from 'next/dist/server/app-render/types';

const require=createRequire(import.meta.url);
let AppRouter:typeof import('next/dist/client/components/app-router').default;
let createQueue:typeof import('next/dist/client/components/app-router-instance').createMutableActionQueue;
let createState:typeof import('next/dist/client/components/router-reducer/create-initial-router-state').createInitialRouterState;
beforeAll(()=>{
  vi.stubEnv('NODE_ENV','production');
  // Next bundles RSC rather than installing it at the package root. Resolve it
  // just for these CommonJS imports, and restore Node resolution immediately.
  vi.stubGlobal('__webpack_require__',()=>({}));
  vi.stubGlobal('__webpack_chunk_load__',()=>Promise.resolve());
  const nodeModule=require('node:module') as {_resolveFilename:(id:string,...args:unknown[])=>string};
  const resolve=nodeModule._resolveFilename;
  nodeModule._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('react-server-dom-webpack')?'next/dist/compiled/'+id:id,...args);};
  try{
    AppRouter=require('next/dist/client/components/app-router').default;
    createQueue=require('next/dist/client/components/app-router-instance').createMutableActionQueue;
    createState=require('next/dist/client/components/router-reducer/create-initial-router-state').createInitialRouterState;
  }finally{nodeModule._resolveFilename=resolve;}
});
afterAll(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
beforeEach(()=>{sessionStorage.clear();clearHandoff();window.history.replaceState(null,'','/pricing');});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function Boundary(){useHandoffBoundary();return <p>Landing state survives</p>;}
async function boot(){
  const tree:FlightRouterState=['',{children:['__PAGE__',{}]},undefined,undefined,true];
  const seed:CacheNodeSeedData=['',<Boundary/>,{},null,false];
  const state=createState({navigatedAt:Date.now(),initialFlightData:[[tree,seed,null,false]],initialCanonicalUrlParts:['','pricing'],initialParallelRoutes:new Map(),location:window.location,couldBeIntercepted:false,postponed:false,prerendered:false});
  const queue=createQueue(state,null);
  await act(async()=>{render(<AppRouter actionQueue={queue} globalErrorState={[()=>null,null]} assetPrefix=""/>);});
  return queue;
}
it('CC N1 real AppRouter preserves __NA on a non-dashboard landing entry and restores Back without document reload',async()=>{
  const errors=vi.spyOn(console,'error');
  const queue=await boot();
  expect(window.history.state.__NA).toBe(true);
  expect(window.history.state.__PRIVATE_NEXTJS_INTERNALS_TREE).toBeTruthy();
  const landing=document.querySelector('p');
  // Next patched history uses the same restoration path as cached navigation.
  await act(async()=>{window.history.pushState({},'','/pricing?linked=yes');});
  expect(queue.state.canonicalUrl).toBe('/pricing?linked=yes');
  await act(async()=>{window.history.back();});
  await waitFor(()=>expect(queue.state.canonicalUrl).toBe('/pricing'));
  expect(window.history.state.__NA).toBe(true);
  expect(document.querySelector('p')).toBe(landing);
  expect(errors).not.toHaveBeenCalled();
  // Native hash changes must leave canonicalUrl untouched as well.

  await act(async()=>{window.location.hash='vz=malformed';});
  await waitFor(()=>expect(window.location.hash).toBe(''));
  await captureHandoff();
  expect(queue.state.canonicalUrl).toBe('/pricing');
  expect(window.history.state.__NA).toBe(true);
  expect(sessionStorage.length).toBe(0);
});
