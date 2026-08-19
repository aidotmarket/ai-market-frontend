import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardCatchAllPage from './page';

const navigation = vi.hoisted(() => ({
  notFound: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: navigation.notFound,
}));

describe('DashboardCatchAllPage', () => {
  beforeEach(() => {
    navigation.notFound.mockReset();
  });

  it('surfaces unmatched dashboard paths as not found', () => {
    DashboardCatchAllPage();

    expect(navigation.notFound).toHaveBeenCalledOnce();
  });
});
