import {createRoot} from 'react-dom/client';
import ListingSamplePreview from '@/components/listings/ListingSamplePreview';
import '@/app/globals.css';
createRoot(document.getElementById('root')!).render(<div className="mx-auto max-w-7xl px-4 py-8"><div className="grid grid-cols-1 gap-8 lg:grid-cols-3"><div className="space-y-8 lg:col-span-2">
  <h1>Synthetic listing</h1><h2>Schema Information</h2>
  <ListingSamplePreview listingId="00000000-0000-4000-8000-000000000004" slug="synthetic-current" />
</div><aside>Purchase controls unchanged</aside></div></div>);
