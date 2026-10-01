'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getCurrentTerms } from '@/api/legal';

const TermsVersionContext = createContext<string | null | undefined>(undefined);

// Fetch only when there is no server-selected version.
function useFetchedTermsVersion(initialVersion: string | null, enabled: boolean) {
  const [version, setVersion] = useState(initialVersion);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.resolve().then(() => getCurrentTerms()).then((terms) => {
      if (!cancelled) setVersion(terms.terms_version);
    }).catch(() => { /* Keep the server-selected copy when metadata is unavailable. */ });
    return () => { cancelled = true; };
  }, [enabled]);
  return version;
}

export function TermsVersionProvider({ initialVersion, children }: { initialVersion: string | null; children: ReactNode }) {
  const fetched = useFetchedTermsVersion(null, initialVersion === null);
  const version = initialVersion ?? fetched;
  return <TermsVersionContext.Provider value={version}>{children}</TermsVersionContext.Provider>;
}

export function useServedTermsVersion() {
  const context = useContext(TermsVersionContext);
  const fetched = useFetchedTermsVersion(null, context === undefined);
  return context === undefined ? fetched : context;
}

export default function VersionedTermsCopy({ legacy, terms12 }: { legacy: ReactNode; terms12: ReactNode }) {
  const version = useServedTermsVersion();
  return <>{version === '1.2' ? terms12 : legacy}</>;
}
