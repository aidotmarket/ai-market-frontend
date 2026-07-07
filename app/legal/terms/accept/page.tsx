import { Suspense } from 'react';
import TermsAcceptClient from './TermsAcceptClient';

export default function TermsAcceptPage() {
  return (
    <Suspense fallback={<TermsAcceptLoading />}>
      <TermsAcceptClient />
    </Suspense>
  );
}

function TermsAcceptLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3F51B5] border-t-transparent"></div>
    </div>
  );
}
