'use client';

import {useId,useRef,useState} from 'react';
import ListingMarkdown from '@/components/ListingMarkdown';

export const DESCRIPTION_LIMIT = 10_000;
export const DESCRIPTION_TOO_LONG = 'Shorten the description to 10,000 characters to save.';
export const descriptionTooLong = (value:string) => [...value].length > DESCRIPTION_LIMIT;
type Action = 'Heading' | 'Bold' | 'Italic' | 'Bulleted list' | 'Numbered list';
const actions:Action[] = ['Heading','Bold','Italic','Bulleted list','Numbered list'];

export default function MarkdownTextField({id,value,onChange,onFocus,rows=6,limit=DESCRIPTION_LIMIT,label='Description'}:{id:string;value:string;onChange:(value:string)=>void;onFocus?:()=>void;rows?:number;limit?:number;label?:string}) {
  const textarea=useRef<HTMLTextAreaElement>(null);
  const uid=useId();
  const [preview,setPreview]=useState(false);
  const count=[...value].length;
  const over=count>limit;
  const format=(action:Action)=>{
    const field=textarea.current;if(!field)return;
    const start=field.selectionStart,end=field.selectionEnd;
    const selected=value.slice(start,end);
    let replacement:string, selectionStart:number, selectionEnd:number;
    if(action==='Bold' || action==='Italic') {
      const marker=action==='Bold'?'**':'*';
      replacement=marker+selected+marker;
      selectionStart=start+marker.length;selectionEnd=selectionStart+selected.length;
    } else {
      const prefix=action==='Heading'?'# ':action==='Bulleted list'?'- ':'1. ';
      replacement=selected.split('\n').map((line,index)=>(action==='Numbered list'?`${index+1}. `:prefix)+line).join('\n');
      selectionStart=selected?start:start+replacement.length;selectionEnd=start+replacement.length;
    }
    onChange(value.slice(0,start)+replacement+value.slice(end));
    // Wait for the controlled value to commit before restoring the selection.
    requestAnimationFrame(()=>{field.focus();field.setSelectionRange(selectionStart,selectionEnd);});
  };
  return <div className="mt-2 space-y-2">
    <div role="tablist" aria-label={`${label} mode`} className="flex gap-2">{['Write','Preview'].map((label,index)=><button key={label} id={`${uid}-tab-${index}`} type="button" role="tab" aria-selected={preview===(index===1)} aria-controls={`${uid}-panel`} onClick={()=>setPreview(index===1)} className="rounded border px-3 py-1 text-sm">{label}</button>)}</div>
    <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${preview?1:0}`}>
      {preview?<ListingMarkdown text={value}/>:<>
        <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap gap-2">{actions.map(action=><button key={action} type="button" aria-label={action} onMouseDown={event=>event.preventDefault()} onClick={()=>format(action)} className="rounded border px-2 py-1 text-sm">{action}</button>)}</div>
        <textarea ref={textarea} id={id} aria-label={label} aria-describedby={`${uid}-help ${uid}-count${over?` ${uid}-error`:''}`} aria-invalid={over} rows={rows} value={value} onFocus={onFocus} onChange={event=>onChange(event.target.value)} onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&!event.altKey&&(event.key.toLowerCase()==='b'||event.key.toLowerCase()==='i')){event.preventDefault();format(event.key.toLowerCase()==='b'?'Bold':'Italic');}}} className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"/>
      </>}
    </div>
    <p id={`${uid}-count`} className={`text-xs ${over?'text-red-700':'text-gray-500'}`}>{count.toLocaleString('en-US')} / {limit.toLocaleString('en-US')}</p>
    {over&&<p id={`${uid}-error`} role="alert" className="text-sm text-red-700">{limit===DESCRIPTION_LIMIT?DESCRIPTION_TOO_LONG:`Shorten the ${label.toLowerCase()} to ${limit.toLocaleString('en-US')} characters to save.`}</p>}
    <p id={`${uid}-help`} className="text-xs text-gray-500">Headings, lists, bold and italic. Links, images and HTML show as plain text.</p>
  </div>;
}
