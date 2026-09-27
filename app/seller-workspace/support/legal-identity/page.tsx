import type {Metadata} from 'next';

export const metadata:Metadata={title:'Legal identity support | ai.market'};

export default function LegalIdentitySupportPage(){
  return <main className="mx-auto max-w-2xl space-y-5 px-6 py-16">
    <h1 className="text-3xl font-semibold text-gray-900">Legal identity review</h1>
    <p className="text-gray-700">Your legal details need a check by our support team before you can publish. Your listing has not been published.</p>
    <p className="text-gray-700">Contact support from the email address on your seller account. Our team will explain the secure steps for reviewing your account and any documents needed. You cannot change an accepted licence here.</p>
    <a className="inline-block rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white" href="mailto:support@ai.market?subject=Seller%20legal%20identity%20review">Contact support</a>
  </main>;
}
