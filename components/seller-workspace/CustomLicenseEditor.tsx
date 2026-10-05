import {useId,useRef} from 'react';
import CustomLicenseMarkdown from '@/components/CustomLicenseMarkdown';

const tools=[['Heading','## ',''],['Bulleted list','- ',''],['Numbered list','1. ',''],['Bold','**','**'],['Italic','*','*']] as const;
export default function CustomLicenseEditor({text,onChange}:{text:string;onChange:(text:string)=>void}) {
  const input=useRef<HTMLTextAreaElement>(null);
  const help=useId();
  function format(prefix:string,suffix:string) {
    const field=input.current;
    if(!field)return;
    const start=field.selectionStart,end=field.selectionEnd;
    const selected=text.slice(start,end);
    const block=suffix==='';
    const lineStart=block&&start>0?text.lastIndexOf('\n',start-1)+1:start;
    const replacement=block?text.slice(lineStart,end).split('\n').map(line=>prefix+line).join('\n'):prefix+selected+suffix;
    onChange(text.slice(0,lineStart)+replacement+text.slice(end));
    requestAnimationFrame(()=>{
      field.focus();
      field.setSelectionRange(start+prefix.length,block?lineStart+replacement.length:end+prefix.length);
    });
  }
  return <>
    <div role="group" aria-label="Licence formatting" className="flex flex-wrap gap-2">
      {tools.map(([label,prefix,suffix])=><button key={label} type="button" onClick={()=>format(prefix,suffix)} className="rounded border px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-indigo-700">{label}</button>)}
    </div>
    <label className="block text-sm font-medium text-gray-900">Your licence text
      <textarea ref={input} aria-label="Your licence text" aria-describedby={help} value={text} onChange={event=>onChange(event.target.value)} rows={12} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm" />
    </label>
    <p id={help} className="text-xs text-gray-600">Headings, lists, bold and italic are supported. Other syntax is shown as text.</p>
    <section aria-label="Live custom licence preview" className="max-h-96 overflow-auto rounded-lg border p-4"><h3 className="font-medium">Live preview</h3><CustomLicenseMarkdown text={text}/></section>
  </>;
}
