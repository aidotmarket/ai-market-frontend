'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import CustomLicenseMarkdown from './CustomLicenseMarkdown';
import {api} from '@/api/client';

// Both seller selection and verified buyer disclosure use this same reading surface.
export default function LicenseReadingDialog({label, href, text, onOpen, disabled=false, pdf=false, customMarkdown=false}: {label:string;href:string;text?:string;onOpen?:()=>void;disabled?:boolean;pdf?:boolean;customMarkdown?:boolean}){
  const [open,setOpen]=useState(false);const [loaded,setLoaded]=useState<string|null>(null);const [failed,setFailed]=useState(false);
  const titleId=useId();const panel=useRef<HTMLDivElement>(null);const close=useRef<HTMLButtonElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const backdrop=panel.current?.parentElement;
    const siblings=Array.from(document.body.children).filter((e):e is HTMLElement=>e instanceof HTMLElement&&e!==backdrop);
    const inert=siblings.map(e=>e.inert);siblings.forEach(e=>{e.inert=true;});
    close.current?.focus();
    const focusable=()=>Array.from(panel.current?.querySelectorAll<HTMLElement>('*')??[]).filter(e=>e.matches('button:not(:disabled), a[href], [tabindex="0"]'));
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();setOpen(false);}
      if(e.key==='Tab'){
        const elements=focusable();const first=elements[0];const last=elements.at(-1);
        if(e.shiftKey&&(document.activeElement===first||!panel.current?.contains(document.activeElement))){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&(document.activeElement===last||!panel.current?.contains(document.activeElement))){e.preventDefault();first?.focus();}
      }
    };
    const focus=(e:FocusEvent)=>{if(!panel.current?.contains(e.target as Node))close.current?.focus();};
    document.addEventListener('keydown',key);document.addEventListener('focusin',focus);
    return()=>{document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus);siblings.forEach((e,i)=>{e.inert=inert[i];});document.body.style.overflow=overflow;(previous?.isConnected?previous:trigger.current)?.focus();};
  },[open]);
  useEffect(()=>{
    if(!open||text!==undefined||pdf)return;
    const controller=new AbortController();setLoaded(null);setFailed(false);
    api.get(`${href}?format=json`,{signal:controller.signal}).then(r=>{
      if(controller.signal.aborted)return;
      if(typeof r.data.full_text!=='string')throw new Error('Missing licence text');
      setLoaded(r.data.full_text);
    }).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
    return()=>controller.abort();
  },[open,href,text,pdf]);
  return <><button ref={trigger} type="button" disabled={disabled} onClick={e=>{e.preventDefault();e.stopPropagation();setOpen(true);onOpen?.();}} className="text-sm text-indigo-700 underline disabled:opacity-50">{label}</button>
    {open&&createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"><div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between gap-4"><h2 id={titleId} className="text-lg font-semibold">{label}</h2><button ref={close} type="button" onClick={()=>setOpen(false)} className="rounded border px-3 py-2">Close</button></div>
      <div tabIndex={0} className="my-4 min-h-0 overflow-auto">{pdf?<object data={href} type="application/pdf" tabIndex={-1} aria-label="Full licence PDF" className="h-[65vh] w-full"><p>Open the verified PDF in a new tab to read it.</p></object>:text!==undefined||loaded!==null?customMarkdown&&text!==undefined?<CustomLicenseMarkdown text={text}/>:<pre dir="auto" className="whitespace-pre-wrap break-words font-sans text-sm leading-6">{text??loaded}</pre>:failed?<p role="alert">The full text could not be loaded. Open it in a new tab to read it.</p>:<p role="status">Loading full text…</p>}</div>
      <a href={href} target="_blank" rel="noreferrer" className="text-sm text-indigo-700 underline">Open in new tab</a>
    </div></div>,document.body)}
  </>;
}
