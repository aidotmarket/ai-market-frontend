import axios from 'axios';
import { api } from './client';
import type { ListingAssistant } from '@/components/seller-workspace/SellerListingEditor';

export function createListingAssistant(): ListingAssistant {
  let pending: { serialized: string; id: string } | null = null;
  return async (request, signal) => {
    const serialized = JSON.stringify(request);
    if (!pending || pending.serialized !== serialized) pending = { serialized, id: crypto.randomUUID() };
    const attempt = pending;
    try {
      const response = await api.post('/seller-workspace/listing-assistant', { request_id: attempt.id, request }, { signal });
      if (pending === attempt) pending = null;
      return response.data;
    } catch (error) {
      if (pending === attempt && axios.isAxiosError(error) && error.response && error.response.status !== 409) pending = null;
      throw error;
    }
  };
}
