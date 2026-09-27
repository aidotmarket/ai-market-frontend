import { beforeEach, expect, it, vi } from 'vitest';
import { acceptTerms } from './legal';

const client = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('./client', () => ({ api: client }));

const request = {
  scope: 'individual' as const,
  signer_full_name: 'Ada Buyer', signer_title: 'Director', business_legal_name: 'Buyer Ltd',
  authority_ack: true, ack_box1: true, ack_box2: true, ack_box3: true,
};

beforeEach(() => client.post.mockResolvedValue({ data: { accepted: true } }));

it.each(['buyer', 'seller'] as const)('posts %s context', async (context) => {
  await acceptTerms(context === 'seller' ? { ...request, context } : request);
  expect(client.post).toHaveBeenCalledWith('/legal/terms/accept', { ...request, context });
});
