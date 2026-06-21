import axios from 'axios';

// API host: same origin in production (Render serves API + UI together).
// VITE_API_URL only for split hosting (UI on CDN, API elsewhere). Dev uses localhost:4000.
function resolveApiBaseUrl() {
  if (import.meta.env.PROD && typeof window !== 'undefined') {
    return window.location.origin;
  }
  if (import.meta.env.VITE_API_URL) {
    return String(import.meta.env.VITE_API_URL).replace(/\/$/, '');
  }
  return 'http://localhost:4000';
}
const API_BASE_URL = resolveApiBaseUrl();

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle common errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      // Wrong PIN/password must not trigger a full-page redirect
      if (url.includes('/api/auth/login') || url.includes('/api/auth/login-web')) {
        return Promise.reject(error);
      }
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      try {
        localStorage.removeItem('auth-storage');
      } catch (_) {
        /* ignore */
      }
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// API endpoints
export const authAPI = {
  login: (pin, role, business_code) => api.post('/api/auth/login', { pin, role, business_code }),
  loginWeb: (email, password, business_code) =>
    api.post('/api/auth/login-web', { email, password, business_code }),
  logout: () => api.post('/api/auth/logout'),
  me: () => api.get('/api/auth/me'),
  changePin: (currentPin, newPin) => api.post('/api/auth/change-pin', { currentPin, newPin }),
  changePassword: (currentPassword, newPassword) => api.post('/api/auth/change-password', { currentPassword, newPassword }),
};

export const paymentsAPI = {
  getMethods: () => api.get('/api/payments/methods'),
  requestCollection: (data) => api.post('/api/payments/request-collection', data),
};

export const productsAPI = {
  getAll: (params = {}) => api.get('/api/products', { params }),
  getById: (id) => api.get(`/api/products/${id}`),
  getByBarcode: (code) => api.get(`/api/products/barcode/${code}`),
  create: (data) => api.post('/api/products', data),
  update: (id, data) => api.put(`/api/products/${id}`, data),
  delete: (id) => api.delete(`/api/products/${id}`),
  adjustStock: (id, data) => api.post(`/api/products/${id}/adjust-stock`, data),
  getCategories: () => api.get('/api/products/categories/list'),
  downloadImportTemplate: () =>
    api.get('/api/products/import/template', { responseType: 'blob' }),
  importFromExcel: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/api/products/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },
};

export const salesAPI = {
  getAll: (params = {}) => api.get('/api/sales', { params }),
  getById: (id) => api.get(`/api/sales/${id}`),
  create: (data) => api.post('/api/sales', data),
  void: (id, reason) => api.post(`/api/sales/${id}/void`, { reason }),
  refund: (id, data) => api.post(`/api/sales/${id}/refund`, data),
  resendReceipt: (id, channel) => api.post(`/api/sales/${id}/resend-receipt`, { channel }),
  getTodaySummary: () => api.get('/api/sales/today-summary'),
};

export const creditAPI = {
  getReceivables: (params = {}) => api.get('/api/credit/receivables', { params }),
  getAging: () => api.get('/api/credit/aging'),
  getSummary: () => api.get('/api/credit/summary'),
  getPayments: (params = {}) => api.get('/api/credit/payments', { params }),
  recordPayment: (data) => api.post('/api/credit/payments', data),
};

export const cartAuditAPI = {
  log: (data) => api.post('/api/cart-audit', data),
};

export const customersAPI = {
  getAll: (params = {}) => api.get('/api/customers', { params }),
  getById: (id) => api.get(`/api/customers/${id}`),
  create: (data) => api.post('/api/customers', data),
  update: (id, data) => api.put(`/api/customers/${id}`, data),
  delete: (id) => api.delete(`/api/customers/${id}`),
  getHistory: (id, params = {}) => api.get(`/api/customers/${id}/history`, { params }),
  redeemPoints: (id, data) => api.post(`/api/customers/${id}/redeem-points`, data),
};

export const suppliersAPI = {
  getAll: (params = {}) => api.get('/api/suppliers', { params }),
  getById: (id) => api.get(`/api/suppliers/${id}`),
  create: (data) => api.post('/api/suppliers', data),
  update: (id, data) => api.put(`/api/suppliers/${id}`, data),
  delete: (id) => api.delete(`/api/suppliers/${id}`),
};

export const expensesAPI = {
  getAll: (params = {}) => api.get('/api/expenses', { params }),
  getById: (id) => api.get(`/api/expenses/${id}`),
  getCategories: () => api.get('/api/expenses/categories/list'),
  getTodaySummary: (params = {}) => api.get('/api/expenses/summary/today', { params }),
  getSummary: (params = {}) => api.get('/api/expenses/summary', { params }),
  create: (data) => api.post('/api/expenses', data),
  update: (id, data) => api.put(`/api/expenses/${id}`, data),
  delete: (id) => api.delete(`/api/expenses/${id}`),
};

export const usersAPI = {
  getAll: (params = {}) => api.get('/api/users', { params }),
  getDirectory: () => api.get('/api/users/directory'),
  getById: (id) => api.get(`/api/users/${id}`),
  create: (data) => api.post('/api/users', data),
  update: (id, data) => api.put(`/api/users/${id}`, data),
  delete: (id) => api.delete(`/api/users/${id}`),
  resetPin: (id, newPin) => api.post(`/api/users/${id}/reset-pin`, { newPin }),
  getStats: () => api.get('/api/users/stats/overview'),
};

export const inventoryAPI = {
  getLowStock: () => api.get('/api/inventory/low-stock'),
  getExpiring: (params = {}) => api.get('/api/inventory/expiring', { params }),
  getAdjustments: (params = {}) => api.get('/api/inventory/adjustments', { params }),
  restock: (data) => api.post('/api/inventory/restock', data),
  getSummary: () => api.get('/api/inventory/summary'),
  getPurchaseHistory: (params = {}) => api.get('/api/inventory/purchase-history', { params }),
  getMovements: (productId, params = {}) => api.get(`/api/inventory/movements/${productId}`, { params }),
};

export const agentFloatAPI = {
  getTodaySession: (params = {}) => api.get('/api/agent-float/session/today', { params }),
  openSession: (data) => api.post('/api/agent-float/session/open', data),
  recordTransaction: (data) => api.post('/api/agent-float/transactions', data),
  closeSession: (data) => api.post('/api/agent-float/session/close', data),
  voidTransaction: (id) => api.delete(`/api/agent-float/transactions/${id}`),
  getReport: (params = {}) => api.get('/api/agent-float/report', { params }),
};

export const reportsAPI = {
  getDaily: (params = {}) => api.get('/api/reports/daily', { params }),
  getMonthly: (params = {}) => api.get('/api/reports/monthly', { params }),
  getAnnual: (params = {}) => api.get('/api/reports/annual', { params }),
  getProfit: (params = {}) => api.get('/api/reports/profit', { params }),
  getBestSellers: (params = {}) => api.get('/api/reports/best-sellers', { params }),
  getCashier: (params = {}) => api.get('/api/reports/cashier', { params }),
  getExportData: (params = {}, axiosConfig = {}) =>
    api.get('/api/reports/export-data', { ...axiosConfig, params }),
};

export const notificationsAPI = {
  getAll: (params = {}) => api.get('/api/notifications', { params }),
  markAsRead: (id) => api.post(`/api/notifications/${id}/read`),
  markAllAsRead: () => api.post('/api/notifications/read-all'),
  getCount: () => api.get('/api/notifications/count'),
  compose: (data) => api.post('/api/notifications/compose', data),
  stream: () => {
    try {
      const token = localStorage.getItem('auth_token');
      const base = resolveApiBaseUrl();
      const u = new URL('/api/notifications/stream', base);
      if (token) u.searchParams.set('token', token);
      return u.toString();
    } catch {
      return `${resolveApiBaseUrl()}/api/notifications/stream`;
    }
  },
};

export const syncAPI = {
  getStatus: () => api.get('/api/sync/status'),
  push: (data) => api.post('/api/sync/push', data),
  pull: (data) => api.post('/api/sync/pull', data),
  force: (data) => api.post('/api/sync/force', data),
  resolveConflict: (data) => api.post('/api/sync/resolve-conflict', data),
  getConflicts: () => api.get('/api/sync/conflicts'),
};

export const supportAPI = {
  create: (data) => api.post('/api/support-requests', data),
  listForStore: () => api.get('/api/support-requests'),
};

export const developerAPI = {
  listBusinesses: () => api.get('/api/developer/businesses'),
  licenseAlerts: () => api.get('/api/developer/license-alerts'),
  createBusiness: (data) => api.post('/api/developer/businesses', data),
  updateBusiness: (id, data) => api.patch(`/api/developer/businesses/${id}`, data),
  notifyStaff: (id, data) => api.post(`/api/developer/businesses/${id}/notify-staff`, data),
  bootstrapAdmin: (id, data) => api.post(`/api/developer/businesses/${id}/bootstrap-admin`, data),
  listStaff: (businessId) => api.get(`/api/developer/businesses/${businessId}/staff`),
  resetStaffCredentials: (businessId, userId, data) =>
    api.patch(`/api/developer/businesses/${businessId}/staff/${userId}`, data),
  getPaymentConfig: (id) => api.get(`/api/developer/businesses/${id}/payment-config`),
  patchPaymentConfig: (id, data) => api.patch(`/api/developer/businesses/${id}/payment-config`, data),
  listSupportAll: () => api.get('/api/support-requests/developer/all'),
  updateSupport: (id, data) => api.patch(`/api/support-requests/developer/${id}`, data),
};

// Utility functions
const ugxFormatter = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const formatCurrencyParts = (amount) => {
  const parts = ugxFormatter.formatToParts(amount || 0);
  let symbol = '';
  let number = '';
  let literal = '';
  for (const part of parts) {
    if (part.type === 'currency') symbol += part.value;
    else if (part.type === 'integer' || part.type === 'group' || part.type === 'fraction' || part.type === 'decimal') {
      number += part.value;
    } else if (part.type === 'literal') literal += part.value;
  }
  return { symbol: symbol.trim(), number, literal };
};

export const formatCurrency = (amount) => ugxFormatter.format(amount || 0);

/** Trigger a browser download from an axios blob response. */
export const downloadBlobResponse = (response, fallbackName = 'download') => {
  const disposition = response.headers?.['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || fallbackName;
  const blob =
    response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: response.headers?.['content-type'] || 'application/octet-stream' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/** Store calendar (matches server STORE_TIMEZONE / Africa/Kampala). */
export const STORE_TIMEZONE = import.meta.env.VITE_STORE_TIMEZONE || 'Africa/Kampala';

const storeDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD in store timezone — same rule as server getStoreToday(). */
export const getStoreToday = () => storeDateFormatter.format(new Date());

/** Add calendar days to a store date (YYYY-MM-DD). */
export const addStoreDays = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return storeDateFormatter.format(base);
};

export const getStoreDateKey = (date) => storeDateFormatter.format(new Date(date));

/** Today / Yesterday / formatted date for stock purchase log grouping. */
export const getPurchaseDayLabel = (iso) => {
  const key = getStoreDateKey(iso);
  const today = getStoreToday();
  if (key === today) return 'Today';
  if (key === addStoreDays(today, -1)) return 'Yesterday';
  return formatDate(iso);
};

export const storeAPI = {
  getCalendar: () => api.get('/api/store/calendar'),
};

export const docsAPI = {
  getUserGuide: () => api.get('/api/docs/user-guide'),
};

export const formatDate = (date, options = {}) => {
  const dateObj = new Date(date);
  return new Intl.DateTimeFormat('en-UG', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(dateObj);
};

export const formatDateTime = (date) => {
  return new Intl.DateTimeFormat('en-UG', {
    timeZone: STORE_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

export const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  
  // Uganda phone number format
  const clean = phone.replace(/\D/g, '');
  
  if (clean.startsWith('256')) {
    return `+${clean}`;
  } else if (clean.startsWith('0')) {
    return `+256${clean.substring(1)}`;
  } else if (clean.length === 9) {
    return `+256${clean}`;
  }
  
  return phone;
};

export const generateReceiptNumber = () => {
  const today = getStoreToday().replace(/-/g, '');
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `INV-${today}-${random}`;
};

// Error handling
export const handleApiError = (error) => {
  if (error.response) {
    // Server responded with error status
    const message = error.response.data?.error || error.response.statusText || 'Server error';
    return { message, status: error.response.status, data: error.response.data };
  } else if (error.request) {
    // Request was made but no response received
    return { message: 'Network error. Please check your connection.', status: null };
  } else {
    // Something else happened
    return { message: error.message || 'An unexpected error occurred.', status: null };
  }
};

// Check if online
export const isOnline = () => {
  return navigator.onLine;
};

// Export the configured axios instance for custom requests
export default api;
