'use client';

import {useEffect,useRef,useState} from 'react';

// Measure a resource-free copy, keeping the visible approved document exact and
// sandboxed with an opaque origin. The copy admits only the renderer's text tags
// and classes; its CSP blocks scripts, network resources and navigation.
function measurementDocument(html:string) {
  const source=new DOMParser().parseFromString(html,'text/html');
  const target=document.implementation.createHTMLDocument('Preview measurement');
  const policy=target.createElement('meta');
  policy.httpEquiv='Content-Security-Policy';
  policy.content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
  target.head.prepend(policy);
  source.querySelectorAll('style').forEach(style=>{const copy=target.createElement('style');copy.textContent=style.textContent;target.head.append(copy);});
  const allowed=new Set(['ARTICLE','P','H1','H2','H3','UL','OL','LI','DL','DIV','DT','DD','SPAN','BR','STRONG','EM']);
  const copy=(node:Node,parent:Node)=>{
    if(node.nodeType===Node.TEXT_NODE){parent.appendChild(target.createTextNode(node.textContent??''));return;}
    if(!(node instanceof Element)||!allowed.has(node.tagName))return;
    const element=target.createElement(node.tagName.toLowerCase());
    if(node.hasAttribute('class'))element.className=node.getAttribute('class')!;
    parent.appendChild(element);node.childNodes.forEach(child=>copy(child,element));
  };
  source.body.childNodes.forEach(node=>copy(node,target.body));
  return '<!doctype html>'+target.documentElement.outerHTML;
}

export default function ApprovedListingPreview({html,title,onLoad}:{html:string;title:string;onLoad?:()=>void}) {
  const frame=useRef<HTMLIFrameElement>(null);
  const [height,setHeight]=useState(150);
  useEffect(()=>{
    const visible=frame.current;if(!visible)return;
    const measure=document.createElement('iframe');
    measure.setAttribute('sandbox','allow-same-origin');
    measure.setAttribute('aria-hidden','true');measure.tabIndex=-1;
    measure.title='Preview layout measurement';measure.referrerPolicy='no-referrer';
    Object.assign(measure.style,{position:'absolute',visibility:'hidden',pointerEvents:'none',height:'0',border:'0'});
    let contentObserver:ResizeObserver|undefined;
    const resize=()=>{if(measure.contentDocument?.body){const size=measure.contentDocument.body.scrollHeight; if(size>0)setHeight(Math.ceil(size)+2);}};
    const width=()=>{measure.style.width=`${visible.clientWidth}px`;resize();};
    measure.onload=()=>{
      contentObserver?.disconnect();
      if(typeof ResizeObserver!=='undefined'&&measure.contentDocument?.body){contentObserver=new ResizeObserver(resize);contentObserver.observe(measure.contentDocument.body);}
      resize();
    };
    measure.srcdoc=measurementDocument(html);
    visible.parentElement?.append(measure);width();
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(width):null;
    observer?.observe(visible);window.addEventListener('resize',width);
    return()=>{observer?.disconnect();contentObserver?.disconnect();window.removeEventListener('resize',width);measure.onload=null;measure.remove();};
  },[html]);
  return <iframe ref={frame} title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={html} onLoad={onLoad}
    style={{height,maxHeight:'min(720px,80vh)'}} className="block w-full rounded-xl border border-gray-200 bg-white" />;
}
