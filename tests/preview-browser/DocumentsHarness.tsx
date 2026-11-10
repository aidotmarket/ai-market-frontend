import {useEffect, useState} from 'react';
import {AppRouterContext, type AppRouterInstance} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {PathParamsContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import EditListingPage from '@/app/dashboard/listings/[id]/edit/page';
import SellerWorkspacePage from '@/app/dashboard/seller-workspace/page';
import BackendListingHtml from '@/components/BackendListingHtml';
import ListingDocumentation from '@/components/listing/ListingDocumentation';
import {fetchPublicListingDocuments} from '@/lib/api';
import type {ListingDocument} from '@/types/listingDocuments';

export const documentListingId = '00000000-0000-4000-8000-000000000004';
const router: AppRouterInstance = {back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {}};
const params = {id: documentListingId};

export default function DocumentsHarness({mode}: {mode: string}) {
  const [documents, setDocuments] = useState<ListingDocument[] | null>(null);
  useEffect(() => {
    if (mode === 'buyer') void fetchPublicListingDocuments(documentListingId).then(setDocuments);
  }, [mode]);
  return mode === 'buyer' ? <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
    <h1>Synthetic listing</h1><BackendListingHtml description="Description" descriptionHtml="<p>Listing description</p>"/>
    {documents === null ? <p>Loading buyer documents…</p> : <ListingDocumentation documents={documents}/>}
  </main> : mode === 'workspace' ? <SellerWorkspacePage/> :
    <AppRouterContext.Provider value={router}><PathParamsContext.Provider value={params}><EditListingPage/></PathParamsContext.Provider></AppRouterContext.Provider>;
}
