import { api } from './client';

export const getSellerStats = () => api.get('/seller/stats');
export const getSellerFinancials = () => api.get('/seller/financials');
export const getSellerOrders = () => api.get('/seller/orders');
