import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '@/store/auth';

// Mock the auth API module
vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  getMe: vi.fn(),
}));

import * as authApi from '@/api/auth';

const mockLogin = vi.mocked(authApi.login);
const mockRegister = vi.mocked(authApi.register);
const mockGetMe = vi.mocked(authApi.getMe);

describe('Auth Store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
    });
    vi.clearAllMocks();
  });

  it('should start unauthenticated', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
  });

  it('login should store tokens and user', async () => {
    mockLogin.mockResolvedValue({
      access_token: 'access-123',
      refresh_token: 'refresh-456',
      token_type: 'bearer',
    });
    mockGetMe.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      company_name: null,
      role: 'buyer',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      email_verified_at: null,
    });

    await useAuthStore.getState().login('test@example.com', 'password');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('access-123');
    expect(state.refreshToken).toBe('refresh-456');
    expect(state.user?.email).toBe('test@example.com');
    expect(localStorage.getItem('token')).toBe('access-123');
    expect(localStorage.getItem('refresh_token')).toBe('refresh-456');
  });

  it('logout should clear everything', async () => {
    // Set up authenticated state
    localStorage.setItem('token', 'access-123');
    localStorage.setItem('refresh_token', 'refresh-456');
    useAuthStore.setState({
      user: { id: 'user-1', email: 'test@example.com', first_name: null, last_name: null, company_name: null, role: 'buyer', status: 'active', created_at: '', email_verified_at: null },
      token: 'access-123',
      refreshToken: 'refresh-456',
      isAuthenticated: true,
    });

    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.token).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
  });

  it('register should call register then auto-login', async () => {
    mockRegister.mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
      first_name: 'New',
      last_name: 'User',
      company_name: null,
      role: 'buyer',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      email_verified_at: null,
    });
    mockLogin.mockResolvedValue({
      access_token: 'access-789',
      refresh_token: 'refresh-012',
      token_type: 'bearer',
    });
    mockGetMe.mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
      first_name: 'New',
      last_name: 'User',
      company_name: null,
      role: 'buyer',
      status: 'active',
      created_at: '2026-01-01T00:00:00Z',
      email_verified_at: null,
    });

    await useAuthStore.getState().register('new@example.com', 'password', 'New', 'User');

    expect(mockRegister).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password',
      first_name: 'New',
      last_name: 'User',
      role: 'buyer',
    });
    expect(mockLogin).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
