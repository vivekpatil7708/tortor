async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    })
  } catch {
    throw new Error('Unable to connect to server. Make sure the app is running.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data as T
}

export const api = {
  signup: (body: { email: string; phone: string; password: string; business_name?: string }) =>
    request<{ success: boolean }>('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<{ success: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),

  google: (body: { credential: string }) =>
    request<{ success: boolean; isNewUser: boolean; merchant: Record<string, unknown> }>('/api/auth/google', { method: 'POST', body: JSON.stringify(body) }),

  me: () => request<{ merchant: Record<string, unknown> | null }>('/api/auth/me'),

  updateMerchant: (body: Record<string, unknown>) =>
    request<{ merchant: Record<string, unknown> }>('/api/merchant', { method: 'PATCH', body: JSON.stringify(body) }),

  completeOnboarding: () =>
    request<{ success: boolean }>('/api/merchant/onboarding', { method: 'POST' }),

  getLinks: () => request<Record<string, unknown>[]>('/api/links'),

  createLink: (body: Record<string, unknown>) =>
    request<{ link: Record<string, unknown> }>('/api/links', { method: 'POST', body: JSON.stringify(body) }),

  getLink: (id: string) => request<Record<string, unknown>>(`/api/links/${id}`),

  updateLink: (id: string, body: Record<string, unknown>) =>
    request<{ link: Record<string, unknown> }>(`/api/links/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteLink: (id: string) =>
    request<{ success: boolean }>(`/api/links/${id}`, { method: 'DELETE' }),

  getUpis: () => request<Record<string, unknown>[]>('/api/upi'),

  addUpi: (vpa: string) =>
    request<{ upi: Record<string, unknown> }>('/api/upi', { method: 'POST', body: JSON.stringify({ vpa }) }),

  verifyUpi: (id: string) =>
    request<{ upi: Record<string, unknown> }>(`/api/upi/${id}/verify`, { method: 'POST' }),

  deleteUpi: (id: string) =>
    request<{ success: boolean }>(`/api/upi/${id}`, { method: 'DELETE' }),

  setPrimaryUpi: (id: string) =>
    request<{ success: boolean }>(`/api/upi/${id}/primary`, { method: 'POST' }),

  getTransactions: () => request<Record<string, unknown>[]>('/api/transactions/list'),

  updateTransaction: (txnId: string, body: Record<string, unknown>) =>
    request<{ transaction: Record<string, unknown> }>(`/api/transactions/${txnId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  getSettings: () => request<Record<string, unknown>>('/api/settings'),

  saveSettings: (body: Record<string, unknown>) =>
    request<{ settings: Record<string, unknown> }>('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),

  getTemplates: () => request<Record<string, unknown>[]>('/api/templates'),

  createTemplate: (body: { name: string; config: Record<string, unknown> }) =>
    request<{ template: Record<string, unknown> }>('/api/templates', { method: 'POST', body: JSON.stringify(body) }),

  deleteTemplate: (id: string) =>
    request<{ success: boolean }>(`/api/templates/${id}`, { method: 'DELETE' }),

  getAnalytics: () => request<Record<string, unknown>>('/api/analytics'),

  createApiKey: (name: string) =>
    request<{ key: string; prefix: string }>('/api/api-keys', { method: 'POST', body: JSON.stringify({ name }) }),

  getApiKeys: () => request<Record<string, unknown>[]>('/api/api-keys'),

  getTransaction: (txnId: string) => request<Record<string, unknown>>(`/api/transactions/${txnId}`),

  getAnalyticsSummary: (params?: string) => request<Record<string, unknown>>(`/api/analytics/summary${params || ''}`),

  getOrdersTimeseries: (params?: string) => request<{ timeseries: Array<{ date: string; total: number; success: number; failed: number; pending: number }> }>(`/api/analytics/orders-timeseries${params || ''}`),

  getPaymentsTimeseries: (params?: string) => request<{ timeseries: Array<{ date: string; amount: number }> }>(`/api/analytics/payments-timeseries${params || ''}`),

  getStatusBreakdown: (params?: string) => request<{ breakdown: Record<string, number> }>(`/api/analytics/status-breakdown${params || ''}`),

  getTopEntities: (params?: string) => request<{ top_payment_apps: Array<{ name: string; count: number; amount: number }>; top_links: Array<{ name: string; count: number; amount: number }> }>(`/api/analytics/top-entities${params || ''}`),

  getMessagingTemplates: () => request<{ templates: Record<string, unknown>[] }>('/api/messaging/templates'),

  saveMessagingTemplate: (body: Record<string, unknown>) =>
    request<{ template: Record<string, unknown> }>('/api/messaging/templates', { method: 'PUT', body: JSON.stringify(body) }),

  previewMessage: (body: Record<string, unknown>) =>
    request<{ rendered_subject: string; rendered_body: string; validation: Record<string, unknown> }>('/api/messaging/preview', { method: 'POST', body: JSON.stringify(body) }),

  sendMessage: (body: Record<string, unknown>) =>
    request<{ success: boolean; log: Record<string, unknown> }>('/api/messaging/send', { method: 'POST', body: JSON.stringify(body) }),

  getMessageLogs: (orderId?: string) =>
    request<{ logs: Record<string, unknown>[] }>(`/api/messaging/logs${orderId ? `?orderId=${orderId}` : ''}`),

  getChannelStatus: () =>
    request<{ channels: Record<string, { status: string; provider: string; description: string }> }>('/api/integrations/channels/status'),

  // ==================== Phase 1 operations ====================
  getOverview: <T extends Record<string, unknown> = Record<string, unknown>>(params?: string) => request<T>(`/api/overview${params || ''}`),

  getProducts: <T extends Record<string, unknown> = Record<string, unknown>>(params?: string) =>
    request<{ products: T[]; total: number; page: number; page_size: number; total_pages: number }>(`/api/products${params || ''}`),

  getProduct: <T extends Record<string, unknown> = Record<string, unknown>>(id: string) =>
    request<{ product: T }>(`/api/products/${id}`),

  createProduct: <T extends Record<string, unknown> = Record<string, unknown>>(body: Record<string, unknown>) =>
    request<{ product: T }>('/api/products', { method: 'POST', body: JSON.stringify(body) }),

  updateProduct: (id: string, body: Record<string, unknown>) =>
    request<{ product: Record<string, unknown> }>(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  archiveProduct: (id: string) =>
    request<{ success: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),

  getCustomers: <T extends Record<string, unknown> = Record<string, unknown>>(params?: string) =>
    request<{ customers: T[]; total: number; page: number; page_size: number; total_pages: number }>(`/api/customers${params || ''}`),

  getCustomer: <T extends Record<string, unknown> = Record<string, unknown>>(id: string) =>
    request<{ customer: T; addresses: Record<string, unknown>[]; orders: Record<string, unknown>[] }>(`/api/customers/${id}`),

  createCustomer: <T extends Record<string, unknown> = Record<string, unknown>>(body: Record<string, unknown>) =>
    request<{ customer: T }>('/api/customers', { method: 'POST', body: JSON.stringify(body) }),

  updateCustomer: (id: string, body: Record<string, unknown>) =>
    request<{ customer: Record<string, unknown> }>(`/api/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteCustomer: (id: string) =>
    request<{ success: boolean }>(`/api/customers/${id}`, { method: 'DELETE' }),

  addAddress: (customerId: string, body: Record<string, unknown>) =>
    request<{ address: Record<string, unknown> }>(`/api/customers/${customerId}/addresses`, { method: 'POST', body: JSON.stringify(body) }),

  updateAddress: (customerId: string, addressId: string, body: Record<string, unknown>) =>
    request<{ address: Record<string, unknown> }>(`/api/customers/${customerId}/addresses/${addressId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteAddress: (customerId: string, addressId: string) =>
    request<{ success: boolean }>(`/api/customers/${customerId}/addresses/${addressId}`, { method: 'DELETE' }),

  getOrders: <T extends Record<string, unknown> = Record<string, unknown>>(params?: string) =>
    request<{ orders: T[]; total: number; page: number; page_size: number; total_pages: number }>(`/api/orders${params || ''}`),

  getOrder: <T extends Record<string, unknown> = Record<string, unknown>>(id: string) =>
    request<{ order: T }>(`/api/orders/${id}`),

  createOrder: <T extends Record<string, unknown> = Record<string, unknown>>(body: Record<string, unknown>) =>
    request<{ order: T }>('/api/orders', { method: 'POST', body: JSON.stringify(body) }),

  updateOrder: (id: string, body: Record<string, unknown>) =>
    request<{ order: Record<string, unknown> }>(`/api/orders/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  cancelOrder: (id: string, body: Record<string, unknown> = {}) =>
    request<{ success: boolean }>(`/api/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify(body) }),

  createFulfillment: (orderId: string, body: Record<string, unknown>) =>
    request<{ fulfillment: Record<string, unknown> }>(`/api/orders/${orderId}/fulfillments`, { method: 'POST', body: JSON.stringify(body) }),

  updateFulfillment: (id: string, body: Record<string, unknown>) =>
    request<{ fulfillment: Record<string, unknown>; summary: string }>(`/api/fulfillments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  addPackageTracking: (id: string, body: Record<string, unknown>) =>
    request<{ result: Record<string, unknown> }>(`/api/fulfillments/${id}/package`, { method: 'PATCH', body: JSON.stringify(body) }),

  setPackageStatus: (id: string, body: Record<string, unknown>) =>
    request<{ result: Record<string, unknown> }>(`/api/fulfillments/${id}/package`, { method: 'PATCH', body: JSON.stringify(body) }),

  addShipmentEvent: (id: string, body: Record<string, unknown>) =>
    request<{ event: Record<string, unknown> }>(`/api/fulfillments/${id}/package`, { method: 'POST', body: JSON.stringify(body) }),

  getDelivery: <T extends Record<string, unknown> = Record<string, unknown>>(params?: string) =>
    request<{ rows: T[]; counts: Record<string, number> }>(`/api/delivery${params || ''}`),

  getMerchantProfile: () => request<{ profile: Record<string, unknown> }>('/api/merchant/profile'),

  updateMerchantProfile: (body: Record<string, unknown>) =>
    request<{ profile: Record<string, unknown> }>('/api/merchant/profile', { method: 'PATCH', body: JSON.stringify(body) }),

  getTrack: <T extends Record<string, unknown> = Record<string, unknown>>(orderNumber: string, token: string) =>
    request<T>(`/api/track/${orderNumber}?token=${encodeURIComponent(token)}`),
}

// ... existing code continues below
