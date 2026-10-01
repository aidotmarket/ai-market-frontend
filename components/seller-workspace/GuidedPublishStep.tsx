'use client';
import {useListingFlow} from './GuidedListingFlow';
import SellerPublication from './SellerPublication';
export default function GuidedPublishStep({active}:{active:boolean}){
  const flow=useListingFlow();
  const approval=flow?.steps[4].state==='done'?flow.review?.approval:null;
  return approval?<SellerPublication approval={approval} active={active} rendered sampleCount={flow?.review?.sample_object_indices?.length??0}/>:<p role="status" className="rounded-xl border bg-white p-5">{flow?.steps.find(s=>s.next)?.reason??'Approve your current saved review before publishing.'}</p>;
}
