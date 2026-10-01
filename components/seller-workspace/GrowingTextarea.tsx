'use client';
import {useLayoutEffect,useRef,type TextareaHTMLAttributes} from 'react';
export default function GrowingTextarea(props:TextareaHTMLAttributes<HTMLTextAreaElement>){
 const ref=useRef<HTMLTextAreaElement>(null);
 useLayoutEffect(()=>{
  const element=ref.current;if(!element)return;
  const resize=()=>{element.style.height='auto';element.style.height=`${element.scrollHeight+2}px`;};
  resize();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(resize);
  observer?.observe(element);window.addEventListener('resize',resize);
  return()=>{observer?.disconnect();window.removeEventListener('resize',resize);};
 },[props.value]);
 return <textarea {...props} ref={ref} rows={1} style={{resize:'none',overflow:'hidden',...props.style}}/>;
}
