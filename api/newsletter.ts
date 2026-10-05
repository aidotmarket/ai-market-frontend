import { api } from './client';

export interface NewsletterSubscription {
  email: string;
  name?: string;
}

export interface NewsletterSubscriptionResponse {
  success: true;
  message: string;
}

export async function subscribeToNewsletter(subscription: NewsletterSubscription) {
  const response = await api.post<NewsletterSubscriptionResponse>(
    '/newsletter-subscribe',
    subscription,
    { timeout: 15_000 },
  );
  if (response.data?.success !== true || typeof response.data.message !== 'string') {
    throw new Error('Newsletter preference was not confirmed');
  }
  return response.data;
}
