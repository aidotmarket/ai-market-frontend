import { api } from './client';

export const getConnectOnboarding = () => api.post('/connect/onboarding');
export const getConnectStatus = () => api.get('/connect/status');
export const getConnectLoginLink = () => api.post('/connect/login-link');
