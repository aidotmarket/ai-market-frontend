import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  api: { get: apiGet },
}));

const { getNotifications, getUnreadNotificationCount } = await import('./notifications');

describe('notifications API', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it('opts notification list polling out of onboarding redirects', async () => {
    apiGet.mockResolvedValue({
      data: { items: [], total: 0, limit: 20, offset: 0, unread_only: false },
    });

    await getNotifications({ limit: 20, unread_only: true });

    expect(apiGet).toHaveBeenCalledWith('/notifications', {
      params: { limit: 20, unread_only: true },
      skipOnboardingRedirect: true,
    });
  });

  it('opts unread count polling out of onboarding redirects', async () => {
    apiGet.mockResolvedValue({ data: { unread_count: 0 } });

    await getUnreadNotificationCount();

    expect(apiGet).toHaveBeenCalledWith('/notifications/unread-count', {
      skipOnboardingRedirect: true,
    });
  });
});
