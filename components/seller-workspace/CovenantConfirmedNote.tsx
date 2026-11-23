'use client';
import {COVENANT_AUTHORITY_CONFIRMATION} from '@/lib/sellerCovenantConfirmation';

/** Read-only record that the covenant and authority were confirmed with the licence choice. */
export default function CovenantConfirmedNote({count=1}:{count?:number}) {
  return <p role="note" aria-label="Covenant and authority confirmed" className="rounded-lg bg-green-50 p-3 text-sm leading-6 text-green-900">
    {count>1?`Covenant and authority already confirmed for all ${count} listings when each licence was chosen`:'Covenant and authority already confirmed when you chose this licence'}: “{COVENANT_AUTHORITY_CONFIRMATION}” If you change the licence choice, you confirm it again there.
  </p>;
}
