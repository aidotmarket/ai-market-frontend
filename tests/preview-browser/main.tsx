import {createRoot} from 'react-dom/client';
import ListingSamplePreview from '@/components/listings/ListingSamplePreview';
import SellerAtAGlance from '@/components/listings/SellerAtAGlance';
import BuyerAtAGlance, {BuyerSamplePreview} from '@/components/listings/BuyerAtAGlance';
import GatewayDeliverySection from '@/components/orders/GatewayDeliverySection';
import {preview} from '@/tests/summaryFixture';
import '@/app/globals.css';
const listingId = '00000000-0000-4000-8000-000000000004';
const parity = new URLSearchParams(window.location.search).has('parity');
const gateway = new URLSearchParams(window.location.search).has('gateway');
createRoot(document.getElementById('root')!).render(gateway ? <GatewayDeliverySection orderId="order-1" /> : parity ? <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
  <section aria-label="Seller preview"><SellerAtAGlance listingId={listingId} slug="synthetic-current" /></section>
  <section aria-label="Buyer output">
    <BuyerAtAGlance slug="synthetic-current" listingId={listingId} initialSummary={preview.at_a_glance} includeSample={false} />
    <div aria-label="Schema Information"><h2>Schema Information</h2></div>
    <BuyerSamplePreview slug="synthetic-current" listingId={listingId} />
  </section>
</main> : <div className="mx-auto max-w-7xl px-4 py-8"><div className="grid grid-cols-1 gap-8 lg:grid-cols-3"><div className="space-y-8 lg:col-span-2">
  <h1>Synthetic listing</h1><h2>Schema Information</h2>
  <ListingSamplePreview listingId={listingId} slug="synthetic-current" />
</div><aside>Purchase controls unchanged</aside></div></div>);
