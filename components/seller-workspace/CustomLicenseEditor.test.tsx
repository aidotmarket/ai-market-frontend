// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {useState} from 'react';
import {afterEach,expect,it} from 'vitest';
import CustomLicenseEditor from './CustomLicenseEditor';
afterEach(cleanup);
function Harness({source,disabled=false}:{source:string;disabled?:boolean}) {
 const [text,setText]=useState(source);
 return <fieldset disabled={disabled}><CustomLicenseEditor text={text} onChange={setText}/></fieldset>;
}
it.each([['Bold','**'],['Italic','*']])('%s wraps only the selection and restores editor focus',async(label,marker)=>{
 render(<Harness source={'Pré 🦊 chosen suffix\n'}/>);
 const input=screen.getByLabelText('Your licence text') as HTMLTextAreaElement;
 const start=input.value.indexOf('chosen');input.setSelectionRange(start,start+6);
 fireEvent.click(screen.getByRole('button',{name:label}));
 expect(input.value).toBe('Pré 🦊 '+marker+'chosen'+marker+' suffix\n');
 await waitFor(()=>expect(document.activeElement).toBe(input));
 expect(input.selectionStart).toBe(start+marker.length);
 expect(input.selectionEnd).toBe(start+marker.length+6);
});
it.each([['Heading','## '],['Bulleted list','- '],['Numbered list','1. ']])('%s prefixes selected lines without changing surrounding source',async(label,prefix)=>{
 render(<Harness source={'untouched\nfirst\nsecond\ntail\n'}/>);
 const input=screen.getByLabelText('Your licence text') as HTMLTextAreaElement;
 const start=input.value.indexOf('first')+2,end=input.value.indexOf('second')+6;
 input.setSelectionRange(start,end);
 fireEvent.click(screen.getByRole('button',{name:label}));
 expect(input.value).toBe('untouched\n'+prefix+'first\n'+prefix+'second\ntail\n');
 await waitFor(()=>expect(document.activeElement).toBe(input));
 expect(input.selectionStart).toBe(start+prefix.length);
 expect(input.selectionEnd).toBe(end+prefix.length*2);
});
it('inserts at a collapsed caret and handles the first empty line',async()=>{
 render(<Harness source={'\nCafé\n'}/>);
 const input=screen.getByLabelText('Your licence text') as HTMLTextAreaElement;
 input.setSelectionRange(0,0);fireEvent.click(screen.getByRole('button',{name:'Heading'}));
 expect(input.value).toBe('## \nCafé\n');
 await waitFor(()=>expect(input.selectionStart).toBe(3));
});
it('keeps toolbar and textarea inside the existing disabled fieldset',()=>{
 render(<Harness source="Terms" disabled/>);
 for(const button of screen.getAllByRole('button'))expect(button.matches(':disabled')).toBe(true);
 expect(screen.getByLabelText('Your licence text').matches(':disabled')).toBe(true);
 expect(screen.getByRole('group',{name:'Licence formatting'})).toBeTruthy();
});
