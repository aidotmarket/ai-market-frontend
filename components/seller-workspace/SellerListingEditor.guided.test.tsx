// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {AxiosError} from 'axios';
import SellerListingEditor from './SellerListingEditor';
import {createStandardSelection} from '@/api/listingLicenses';
import type {ListingDraftContent} from '@/api/sellerListingDraft';
const categories=['financial-data','alternative-data','consumer-retail','healthcare-life-sciences','geospatial-location','environmental-climate','technology-web','government-public','energy-utilities','transportation-logistics','real-estate-property','ai-machine-learning'].map(slug=>({slug,name:slug.replaceAll('-',' ')}));
const content:ListingDraftContent={brief:'Weekly sales',title:'Sales',description:'Sales in all regions',category:'financial-data',tags:'sales',price:'25',license:'Dead legacy input',description_source_version:7,license_selection:createStandardSelection(false)};
afterEach(cleanup);
const fieldSuggestion=(field:string)=>within(screen.getByLabelText(field).parentElement!).getByRole('button',{name:'Use suggestion'});
const warning=()=>screen.queryByText('Your files changed after this description was written');
const ask=()=>fireEvent.click(screen.getByRole('button',{name:'Ask Allai to draft my listing'}));
describe('guided editor source binding and saving',()=>{
 it('shows server categories and retains a legacy category through unrelated saves',async()=>{
  const save=vi.fn().mockResolvedValue(undefined);render(<SellerListingEditor initialContent={{...content,category:'Old free text'}} categories={categories} sourceVersion={7} onSave={save}/>);
  const category=screen.getByLabelText('Category') as HTMLSelectElement;expect(category.tagName).toBe('SELECT');expect(category.options).toHaveLength(13);expect(category.value).toBe('');
  expect(screen.queryByRole('button',{name:'Save private draft'})).toBeNull();fireEvent.change(screen.getByLabelText('Title'),{target:{value:'New title'}});
  fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));await waitFor(()=>expect(save).toHaveBeenCalledOnce());expect(save.mock.calls[0][0].category).toBe('Old free text');
  fireEvent.change(category,{target:{value:''}});fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));expect(save.mock.calls[1][0].category).toBe('');
  fireEvent.change(category,{target:{value:'ai-machine-learning'}});expect(category.value).toBe('ai-machine-learning');
 });
 it('hides the dead Review advance in an editor without draft saves',()=>{render(<SellerListingEditor initialContent={content} licensesEnabled onNext={vi.fn()}/>);expect(screen.queryByRole('button',{name:'Next: Review →'})).toBeNull();});
 it('removes the dead licence input only with licences on and previews the actual training choice',()=>{
  const view=render(<SellerListingEditor initialContent={content} licensesEnabled sourceVersion={7} categories={categories}/>);
  expect(screen.queryByLabelText('Your license')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Preview my listing'}));expect(screen.getByText(/ai.market Standard Data Licence v1.0.*training not allowed/)).toBeTruthy();
  view.rerender(<SellerListingEditor initialContent={content} licensesEnabled={false} sourceVersion={7} categories={categories}/>);expect(screen.getByLabelText('Your license')).toBeTruthy();
 });
 it('clears chat and pending suggestions when files change, discards a late reply and sends no summary',async()=>{
  let resolve!:(r:unknown)=>void;const assistant=vi.fn().mockResolvedValueOnce({source_version:7,message:'First chat',proposals:[{field:'title',value:'Pending title',reasoning:''}]}).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  const view=render(<SellerListingEditor initialContent={content} assistant={assistant} sourceVersion={7} categories={categories}/>);
  ask();await screen.findByText('First chat');expect(screen.getByText('Pending title')).toBeTruthy();
  ask();view.rerender(<SellerListingEditor initialContent={content} assistant={assistant} sourceVersion={8} categories={categories}/>);
  expect(screen.queryByText('First chat')).toBeNull();expect(screen.queryByText('Pending title')).toBeNull();expect(warning()).toBeTruthy();
  await act(async()=>resolve({source_version:7,message:'Wrong files',proposals:[{field:'description',value:'Wrong description',reasoning:''}]}));
  expect(await screen.findByText('Your files changed while Allai was drafting. Ask again.')).toBeTruthy();expect(screen.queryByText('Wrong files')).toBeNull();expect(screen.queryByText('Wrong description')).toBeNull();
  expect(Object.keys(assistant.mock.calls[0][0]).sort()).toEqual(['brief','draft','history','instruction','reviewing']);
  expect(screen.getByText('Allai reads your file names and sizes to write the draft. It never opens your files.')).toBeTruthy();expect(screen.getByText('Anything you keep here, including file names, will be public.')).toBeTruthy();
 });
 it('only accepting the current description stamps the source and the stamp survives save and reload',async()=>{
  const save=vi.fn().mockResolvedValue(undefined);const assistant=vi.fn().mockResolvedValue({source_version:8,message:'Suggestions',proposals:[{field:'title',value:'New title',reasoning:''},{field:'description',value:'New files description',reasoning:''}]});
  render(<SellerListingEditor initialContent={content} sourceVersion={8} categories={categories} assistant={assistant} onSave={save}/>);
  ask();await screen.findByText('Suggestions');fireEvent.click(fieldSuggestion('Title'));expect(warning()).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));await waitFor(()=>expect(save).toHaveBeenCalledOnce());expect(save.mock.calls[0][0].description_source_version).toBe(7);
  fireEvent.click(fieldSuggestion('Description'));expect(warning()).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));expect(save.mock.calls[1][0].description_source_version).toBe(8);
  const saved=save.mock.calls[1][0];cleanup();render(<SellerListingEditor initialContent={saved} sourceVersion={8} categories={categories} onSave={save}/>);expect(warning()).toBeNull();expect(screen.queryByRole('button',{name:'Save private draft'})).toBeNull();
  fireEvent.change(screen.getByLabelText('Description'),{target:{value:'Manual update'}});expect(warning()).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(3));expect(save.mock.calls[2][0].description_source_version).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'This description matches my files'}));expect(warning()).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));await waitFor(()=>expect(save).toHaveBeenCalledTimes(4));expect(save.mock.calls[3][0].description_source_version).toBe(8);
 });
 it('keeps the warning after accepting only a title, saving and reloading against new files',async()=>{
  const save=vi.fn().mockResolvedValue(undefined);const assistant=vi.fn().mockResolvedValue({source_version:8,message:'Title only',proposals:[{field:'title',value:'Updated title',reasoning:''}]});
  render(<SellerListingEditor initialContent={content} sourceVersion={8} categories={categories} assistant={assistant} onSave={save}/>);ask();await screen.findByText('Title only');fireEvent.click(fieldSuggestion('Title'));fireEvent.click(screen.getByRole('button',{name:'Save private draft'}));await waitFor(()=>expect(save).toHaveBeenCalledOnce());
  const saved=save.mock.calls[0][0];cleanup();render(<SellerListingEditor initialContent={saved} sourceVersion={8} categories={categories} onSave={save}/>);expect(warning()).toBeTruthy();expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Updated title');
 });
 it('saves first on Next, shows the server failure and stays, then moves on after retry; unchanged Next does not save',async()=>{
  const failure=new AxiosError('refused',undefined,undefined,undefined,{status:409,data:{detail:'Your draft version changed. Reload before saving.'}} as never);
  const save=vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);const next=vi.fn();render(<SellerListingEditor initialContent={content} sourceVersion={7} categories={categories} onSave={save} onNext={next}/>);
  fireEvent.click(screen.getByRole('button',{name:'Next: Review →'}));expect(save).not.toHaveBeenCalled();await waitFor(()=>expect(next).toHaveBeenCalledOnce());next.mockClear();
  fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Changed'}});fireEvent.click(screen.getByRole('button',{name:'Next: Review →'}));expect(await screen.findByText('Your draft version changed. Reload before saving.')).toBeTruthy();expect(next).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Next: Review →'}));await waitFor(()=>expect(next).toHaveBeenCalledOnce());expect(save).toHaveBeenCalledTimes(2);expect(screen.queryByRole('button',{name:'Save private draft'})).toBeNull();
 });
 it('rejects a response for another source without accepting any fields',async()=>{
  const assistant=vi.fn().mockResolvedValue({source_version:6,message:'Old text',proposals:[{field:'title',value:'Wrong title',reasoning:''}]});render(<SellerListingEditor initialContent={content} sourceVersion={7} categories={categories} assistant={assistant}/>);ask();await screen.findByText('Your files changed while Allai was drafting. Ask again.');expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Sales');expect(screen.queryByText('Wrong title')).toBeNull();
 });
});

it('uses growing wrapped title and tag fields and a wrapped category label without changing its slug',()=>{
 const long='A very long category name '.repeat(6);
 render(<SellerListingEditor initialContent={content} categories={[{slug:'financial-data',name:long}]}/>);
 for(const label of ['Title','Tags'])expect(screen.getByLabelText(label).tagName).toBe('TEXTAREA');
 expect((screen.getByLabelText('Category') as HTMLSelectElement).value).toBe('financial-data');
 const display=screen.getByText(long.trim(),{selector:'span'});expect(display.className).toContain('whitespace-normal');
});
