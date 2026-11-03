// @vitest-environment jsdom
import {useState} from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import MarkdownTextField,{DESCRIPTION_TOO_LONG} from './MarkdownTextField';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function Field({initial='before selected after'}:{initial?:string}){const [value,setValue]=useState(initial);return <MarkdownTextField id="description" value={value} onChange={setValue}/>;}
it.each([
 ['Heading','# selected'],['Bold','**selected**'],['Italic','*selected*'],['Bulleted list','- selected'],['Numbered list','1. selected'],
])('formats the selected text with %s and restores focus and selection',(action,replacement)=>{
 const frames:FrameRequestCallback[]=[];vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.push(callback);return frames.length;});
 render(<Field/>);const field=screen.getByRole('textbox') as HTMLTextAreaElement;
 field.focus();field.setSelectionRange(7,15);
 expect(screen.getByRole('toolbar',{name:'Description formatting'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:action}));frames.forEach(callback=>callback(0));
 expect(field.value).toBe(`before ${replacement} after`);expect(document.activeElement).toBe(field);
 expect(field.value.slice(field.selectionStart,field.selectionEnd)).toBe(action==='Bold'||action==='Italic'?'selected':replacement);
});
it.each([['b',true,false,'**selected**'],['i',false,true,'*selected*']] as const)('supports keyboard %s',(key,ctrlKey,metaKey,replacement)=>{
 render(<Field/>);const field=screen.getByRole('textbox') as HTMLTextAreaElement;field.setSelectionRange(7,15);
 fireEvent.keyDown(field,{key,ctrlKey,metaKey});expect(field.value).toBe(`before ${replacement} after`);
});
it('prefixes every selected line for lists',()=>{
 render(<Field initial={'one\ntwo'}/>);const field=screen.getByRole('textbox') as HTMLTextAreaElement;field.setSelectionRange(0,7);
 fireEvent.click(screen.getByRole('button',{name:'Numbered list'}));expect(field.value).toBe('1. one\n2. two');
});
it('counts Unicode code points and keeps preview and write source intact',()=>{
 render(<Field initial="😀𐐀🌍 **bold**"/>);expect(screen.getByText('12 / 10,000')).toBeTruthy();
 fireEvent.click(screen.getByRole('tab',{name:'Preview'}));expect(screen.getByText('bold').tagName).toBe('STRONG');
 fireEvent.click(screen.getByRole('tab',{name:'Write'}));expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('😀𐐀🌍 **bold**');
});
it('preserves 11,000 characters on load and paste and reports the limit',()=>{
 render(<Field initial={'x'.repeat(11000)}/>);const field=screen.getByRole('textbox') as HTMLTextAreaElement;
 expect(field.value.length).toBe(11000);expect(field.hasAttribute('maxlength')).toBe(false);expect(screen.getByText(DESCRIPTION_TOO_LONG)).toBeTruthy();
 expect(screen.getByText('11,000 / 10,000').className).toContain('text-red-');
 fireEvent.change(field,{target:{value:'😀'.repeat(11000)}});expect([...field.value]).toHaveLength(11000);expect(screen.getByText(DESCRIPTION_TOO_LONG)).toBeTruthy();
 fireEvent.change(field,{target:{value:'😀'.repeat(10000)}});expect(screen.queryByText(DESCRIPTION_TOO_LONG)).toBeNull();
});

it('leaves the caret after a list marker when there is no selection',()=>{
 const frames:FrameRequestCallback[]=[];vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.push(callback);return frames.length;});
 render(<Field initial=""/>);const field=screen.getByRole('textbox') as HTMLTextAreaElement;
 fireEvent.click(screen.getByRole('button',{name:'Bulleted list'}));frames.forEach(callback=>callback(0));
 expect(field.value).toBe('- ');expect(field.selectionStart).toBe(2);expect(field.selectionEnd).toBe(2);
});
