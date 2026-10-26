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
  if (res.status === 401 && (await loginHasEnded())) {
    // Signed out on another device, password reset or account suspended: back to the login page.
    window.location.assign('/api/auth/session-ended')
    return new Promise<T>(() => {})
  }
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data as T
}

const SIGNED_IN_PAGES = /^\/(dashboard|onboarding)(\/|$)/

/**
 * Whether a refused request on a signed-in page means the login itself has ended.
 * Many routes answer any error with "Unauthorized", so this asks /api/auth/me
 * before signing anyone out.
 */
async function loginHasEnded(): Promise<boolean> {
  if (typeof window === 'undefined' || !SIGNED_IN_PAGES.test(window.location.pathname)) return false
  try {
    const res = await fetch('/api/auth/me')
    if (!res.ok) return false
    const body = await res.json()
    return body?.merchant === null
  } catch {
    return false
  }
}

/** `q` searches name, phone and reference on the server. */
export type TransactionFilters = { status?: string; from?: string; to?: string; link?: string; q?: string }
export type TransactionQuery = TransactionFilters & { limit?: number; cursor?: string }
/** One page of transactions, newest first. `total` is counted on the first page only. */
export type TransactionPage = { transactions: Record<string, unknown>[]; next_cursor: string | null; total: number | null }

/** Settings -> Google Sheets. Tokens are never part of this response. */
export type GoogleSheetsConnection = {
  id: string
  google_email: string | null
  spreadsheet_id: string | null
  spreadsheet_name: string | null
  spreadsheet_url: string | null
  sheet_name: string
  auto_export: boolean
  connected_at: string
  last_exported_at: string | null
  last_error: string | null
}

export type GoogleSheetsStatus = {
  available: boolean
  configured: boolean
  can_manage: boolean
  can_export: boolean
  connected: boolean
  connection: GoogleSheetsConnection | null
  setup_required: boolean
}

export type GoogleSheetsExportResult = {
  exported: number
  skipped: number
  matched: number
  truncated: boolean
  spreadsheet_name: string | null
  sheet_name: string
  spreadsheet_url: string
}

/** One webhook delivery attempt, with enough detail to debug a receiver. */
export type WebhookLogRow = {
  id: string
  event_id: string
  event_type: string
  status: string
  endpoint_id: string
  endpoint_url: string
  endpoint_mode: 'test' | 'live'
  url: string
  response_code: number | null
  response_body: string | null
  error_message: string | null
  retry_count: number
  next_retry_at: string | null
  delivered_at: string | null
  created_at: string
  payload: string
}

export type WebhookLogsResponse = {
  logs: WebhookLogRow[]
  total: number
  counts: Record<string, number>
  endpoints: Array<{ id: string; url: string; mode: 'test' | 'live' }>
}

/** Filters for the orders list. Every field is optional; omitting one means "any". */
export type OrderQuery = {
  limit?: number
  cursor?: string
  q?: string
  payment_status?: string
  order_status?: string
  fulfillment_status?: string
  source?: string
  from?: string
  to?: string
}

function transactionParams(query: TransactionQuery): string {
  const params = new URLSearchParams({ limit: String(query.limit ?? 50) })
  for (const key of ['cursor', 'status', 'from', 'to', 'link', 'q'] as const) {
    const value = query[key]
    if (value) params.set(key, value)
  }
  return params.toString()
}

/** Every customer matching the search, fetched 200 at a time (for exports). */
export async function fetchAllCustomers(
  q: string,
  onProgress?: (loaded: number, total: number | null) => void
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let total: number | null = null
  let cursor: string | null = null
  do {
    const page: { customers: Record<string, unknown>[]; total: number; next_cursor: string | null } =
      await api.getCustomers({ q: q || undefined, limit: 200, cursor })
    if (total === null) total = page.total
    rows.push(...page.customers)
    onProgress?.(rows.length, total)
    if (page.next_cursor === cursor) break
    cursor = page.next_cursor
  } while (cursor)
  return rows
}

/** Every transaction matching the filters, fetched 500 at a time (for exports). */
export async function fetchAllTransactions(
  filters: TransactionFilters,
  onProgress?: (loaded: number, total: number | null) => void
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let total: number | null = null
  let cursor: string | undefined
  do {
    const page: TransactionPage = await api.getTransactions({ ...filters, limit: 500, cursor })
    if (total === null) total = page.total
    rows.push(...page.transactions)
    onProgress?.(rows.length, total)
    if (page.next_cursor === cursor) break
    cursor = page.next_cursor ?? undefined
  } while (cursor)
  return rows
}

export const api = {
  signup: (body: { email: string; phone: string; password: string; business_name?: string }) =>
    request<{ success: boolean }>('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<{ success: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  logoutOtherDevices: () => request<{ success: boolean }>('/api/auth/logout-all', { method: 'POST' }),

  google: (body: { credential: string }) =>
    request<{ success: boolean; isNewUser: boolean; merchant: Record<string, unknown> }>('/api/auth/google', { method: 'POST', body: JSON.stringify(body) }),

  me: () => request<{ merchant: Record<string, unknown> | null }>('/api/auth/me'),

  updateMerchant: (body: Record<string, unknown>) =>
    request<{ merchant: Record<string, unknown> }>('/api/merchant', { method: 'PATCH', body: JSON.stringify(body) }),

  getTaxSummary: () => request<{
    summary: {
      orders: number
      orders_total: number
      tax_recorded: number
      orders_with_tax: number
      tax_missing: boolean
    }
    merchant: { tax_scheme: string; gstin: string | null; state_code: string | null; state_name: string | null }
    by_payment_status: { status: string; orders: number; total: number; tax: number }[]
    by_destination_state: { state: string; orders: number; total: number }[]
  }>('/api/tax/summary'),

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

  getTransactions: (query: TransactionQuery = {}) =>
    request<TransactionPage>(`/api/transactions/list?${transactionParams(query)}`),

  updateTransaction: (txnId: string, body: Record<string, unknown>) =>
    request<{ transaction: Record<string, unknown> }>(`/api/transactions/${txnId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  getRefunds: (status?: 'pending' | 'processed' | 'failed') =>
    request<{
      refunds: Record<string, unknown>[]
      total_pending: number
      total_processed: number
    }>(`/api/refunds${status ? `?status=${status}` : ''}`),

  createRefund: (body: { order_id?: string; transaction_id?: string; amount: number; reason?: string }) =>
    request<{ refund: Record<string, unknown> }>('/api/refunds', { method: 'POST', body: JSON.stringify(body) }),

  processRefund: (id: string) =>
    request<{ refund: Record<string, unknown>; notifications: Array<Record<string, unknown>> }>(`/api/refunds/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'processed' }),
    }),

  getPendingUpiPayments: () => request<{ payments: Array<Record<string, unknown>> }>('/api/payments/pending'),

  confirmUpiPayment: (id: string) =>
    request<{ status: string }>(`/api/payments/${id}/confirm`, { method: 'POST' }),

  getSettings: () => request<Record<string, unknown>>('/api/settings'),

  saveSettings: (body: Record<string, unknown>) =>
    request<{ settings: Record<string, unknown> }>('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),

  // Settings -> Google Sheets (owner connects; everyone can see the status).
  getGoogleSheets: () => request<GoogleSheetsStatus>('/api/integrations/google-sheets'),

  saveGoogleSheets: (body: { spreadsheet?: string; sheet_name?: string; auto_export?: boolean }) =>
    request<{ connection: GoogleSheetsConnection }>('/api/integrations/google-sheets', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  createGoogleSheetsSpreadsheet: (body: { title?: string } = {}) =>
    request<{ connection: GoogleSheetsConnection }>('/api/integrations/google-sheets/spreadsheet', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  disconnectGoogleSheets: () =>
    request<{ success: boolean }>('/api/integrations/google-sheets', { method: 'DELETE' }),

  exportTransactionsToSheets: (filters: TransactionFilters) =>
    request<GoogleSheetsExportResult>('/api/integrations/google-sheets/export', {
      method: 'POST',
      body: JSON.stringify(filters),
    }),

  getTemplates: () => request<Record<string, unknown>[]>('/api/templates'),

  createTemplate: (body: { name: string; config: Record<string, unknown> }) =>
    request<{ template: Record<string, unknown> }>('/api/templates', { method: 'POST', body: JSON.stringify(body) }),

  deleteTemplate: (id: string) =>
    request<{ success: boolean }>(`/api/templates/${id}`, { method: 'DELETE' }),

  getAnalytics: () => request<Record<string, unknown>>('/api/analytics'),

  createApiKey: (name: string) =>
    request<{ key: string; prefix: string }>('/api/api-keys', { method: 'POST', body: JSON.stringify({ name }) }),

  getApiKeys: () => request<Record<string, unknown>[]>('/api/api-keys'),

  getWebhookEndpoints: () => request<Record<string, unknown>[]>('/api/webhook-endpoints'),

  createWebhookEndpoint: (body: Record<string, unknown>) =>
    request<{ id: string; secret: string }>('/api/webhook-endpoints', { method: 'POST', body: JSON.stringify(body) }),

  updateWebhookEndpoint: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/webhook-endpoints/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteWebhookEndpoint: (id: string) =>
    request<{ success: boolean }>(`/api/webhook-endpoints/${id}`, { method: 'DELETE' }),

  getWebhookDeliveries: (id: string, limit?: number) =>
    request<Record<string, unknown>[]>(`/api/webhook-endpoints/${id}/deliveries${limit ? `?limit=${limit}` : ''}`),

  retryWebhookDelivery: (id: string, logId: string) =>
    request<{ success: boolean; status: string }>(`/api/webhook-endpoints/${id}/deliveries`, { method: 'POST', body: JSON.stringify({ logId }) }),

  sendTestWebhook: (id: string, eventType = 'order.created') =>
    request<{ success: boolean; log_id: string | null; message: string }>(`/api/webhook-endpoints/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ event_type: eventType }),
    }),

  rotateWebhookSecret: (id: string) =>
    request<{ id: string; url: string; secret: string; message: string }>(`/api/webhook-endpoints/${id}/rotate`, { method: 'POST' }),

  getWebhookLogs: (params: { status?: string; eventType?: string; endpointId?: string; limit?: number } = {}) => {
    const query = new URLSearchParams()
    if (params.status && params.status !== 'all') query.set('status', params.status)
    if (params.eventType) query.set('event_type', params.eventType)
    if (params.endpointId) query.set('endpoint_id', params.endpointId)
    if (params.limit) query.set('limit', String(params.limit))
    const qs = query.toString()
    return request<WebhookLogsResponse>(`/api/webhook-deliveries${qs ? `?${qs}` : ''}`)
  },

  retryWebhookLog: (logId: string) =>
    request<{ success: boolean; status: string }>('/api/webhook-deliveries', {
      method: 'POST',
      body: JSON.stringify({ logId }),
    }),

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

  getEmailLogs: () =>
    request<{ logs: Record<string, unknown>[] }>('/api/email/logs'),

  getEmailOpens: (logId: string) =>
    request<{ opens: Record<string, unknown>[] }>(`/api/email/opens/${logId}`),

  getChannelStatus: () =>
    request<{ channels: Record<string, { status: string; provider: string; description: string }> }>('/api/integrations/channels/status'),

  // ==================== Phase 1 operations ====================
  getOverview: <T extends Record<string, unknown> = Record<string, unknown>>(params?: string) => request<T>(`/api/overview${params || ''}`),

  getProducts: <T extends Record<string, unknown> = Record<string, unknown>>(params?: string) =>
    request<{ products: T[]; total: number; page: number; page_size: number; total_pages: number }>(`/api/products${params || ''}`),

  getCoupons: <T extends Record<string, unknown> = Record<string, unknown>>(params?: string) =>
    request<{ coupons: T[]; total: number; page: number; page_size: number; total_pages: number }>(`/api/coupons${params || ''}`),

  createCoupon: (body: Record<string, unknown>) =>
    request<{ coupon: Record<string, unknown> }>('/api/coupons', { method: 'POST', body: JSON.stringify(body) }),

  updateCoupon: (id: string, body: Record<string, unknown>) =>
    request<{ coupon: Record<string, unknown> }>(`/api/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteCoupon: (id: string) =>
    request<{ ok: boolean }>(`/api/coupons/${id}`, { method: 'DELETE' }),

  // Team access (Settings -> Team)
  getTeam: () => request<{
    members: Array<{
      id: string
      email: string
      name: string
      role: string
      status: 'accepted' | 'pending' | 'expired'
      is_you: boolean
      invited_at: string
      accepted_at: string | null
      invite_expires_at: string | null
    }>
    me: { role: string; email: string; name: string; team_member_id: string | null; is_team_member: boolean }
    activity: Array<{
      id: string
      action: string
      entity_type: string | null
      entity_id: string | null
      actor_name: string
      actor_email: string
      actor_role: string | null
      created_at: string
    }>
  }>('/api/team'),

  inviteTeamMember: (body: { email: string; role: 'admin' | 'viewer' }) =>
    request<{ member: Record<string, unknown>; email_sent: boolean; warning: string | null }>('/api/team/invite', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateTeamMember: (id: string, role: 'admin' | 'viewer') =>
    request<{ member: Record<string, unknown> }>(`/api/team/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  removeTeamMember: (id: string) =>
    request<{ success: boolean }>(`/api/team/${id}`, { method: 'DELETE' }),

  resendTeamInvite: (id: string) =>
    request<{ member: Record<string, unknown>; email_sent: boolean; warning: string | null }>(`/api/team/${id}/resend`, {
      method: 'POST',
    }),

  acceptTeamInvite: (token: string) =>
    request<{ success: boolean; merchant: { id: string; business_name: string }; role: string }>('/api/team/accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  getProduct: <T extends Record<string, unknown> = Record<string, unknown>>(id: string) =>
    request<{ product: T }>(`/api/products/${id}`),

  createProduct: <T extends Record<string, unknown> = Record<string, unknown>>(body: Record<string, unknown>) =>
    request<{ product: T }>('/api/products', { method: 'POST', body: JSON.stringify(body) }),

  updateProduct: (id: string, body: Record<string, unknown>) =>
    request<{ product: Record<string, unknown> }>(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  archiveProduct: (id: string) =>
    request<{ success: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),

  // Customer list is paged by cursor, and search runs on the server over name, phone and email.
  getCustomers: <T extends Record<string, unknown> = Record<string, unknown>>(opts?: { q?: string; limit?: number; cursor?: string | null }) => {
    const qs = new URLSearchParams()
    if (opts?.q) qs.set('q', opts.q)
    if (opts?.limit) qs.set('limit', String(opts.limit))
    if (opts?.cursor) qs.set('cursor', opts.cursor)
    const suffix = qs.toString()
    return request<{ customers: T[]; total: number; next_cursor: string | null }>(`/api/customers${suffix ? `?${suffix}` : ''}`)
  },

  orders: <T extends Record<string, unknown> = Record<string, unknown>>(query: OrderQuery = {}) => {
    const qs = new URLSearchParams()
    if (query.limit) qs.set('limit', String(query.limit))
    if (query.cursor) qs.set('cursor', query.cursor)
    for (const key of ['q', 'payment_status', 'order_status', 'fulfillment_status', 'source', 'from', 'to'] as const) {
      const value = query[key]
      if (value) qs.set(key, value)
    }
    const suffix = qs.toString()
    return request<{ orders: T[]; total: number | null; next_cursor: string | null }>(`/api/orders/list${suffix ? `?${suffix}` : ''}`)
  },

  getOrder: <T extends Record<string, unknown> = Record<string, unknown>>(id: string) =>
    request<{ order: T; status_history: Record<string, unknown>[]; fulfillments: Record<string, unknown>[] }>(`/api/orders/${id}`),

  getCustomer: <T extends Record<string, unknown> = Record<string, unknown>>(id: string) =>
    request<{ customer: T; addresses: Record<string, unknown>[]; orders: Record<string, unknown>[] }>(`/api/customers/${id}`),

  createCustomer: <T extends Record<string, unknown> = Record<string, unknown>>(body: Record<string, unknown>) =>
    request<{ customer: T }>('/api/customers', { method: 'POST', body: JSON.stringify(body) }),

  updateCustomer: (id: string, body: Record<string, unknown>) =>
    request<{ customer: Record<string, unknown> }>(`/api/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteCustomer: (id: string) =>
    request<{ success: boolean }>(`/api/customers/${id}`, { method: 'DELETE' }),

  mergeCustomers: (targetId: string, sourceIds: string[]) =>
    request<{ success: boolean; merged: number; kept: string }>('/api/customers/merge', {
      method: 'POST',
      body: JSON.stringify({ targetId, sourceIds }),
    }),

  addAddress: (customerId: string, body: Record<string, unknown>) =>
    request<{ address: Record<string, unknown> }>(`/api/customers/${customerId}/addresses`, { method: 'POST', body: JSON.stringify(body) }),

  deleteAddress: (customerId: string, addressId: string) =>
    request<{ success: boolean }>(`/api/customers/${customerId}/addresses?addressId=${encodeURIComponent(addressId)}`, { method: 'DELETE' }),

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
    request<{ rows: T[]; counts: Record<string, number>; pagination?: Record<string, unknown> }>(`/api/delivery${params || ''}`)
      .then(r => ({ ...r, rows: (r.rows as Record<string, unknown>[]).map(row => camelizeDeep<Record<string, unknown>>(row)) as T[] })),

  getMerchantProfile: () => request<{ profile: Record<string, unknown> }>('/api/merchant/profile'),

  updateMerchantProfile: (body: Record<string, unknown>) =>
    request<{ profile: Record<string, unknown> }>('/api/merchant/profile', { method: 'PATCH', body: JSON.stringify(body) }),

  getTrack: <T extends Record<string, unknown> = Record<string, unknown>>(orderNumber: string, token: string) =>
    request<T>(`/api/track/${orderNumber}?token=${encodeURIComponent(token)}`),

  // ==================== Phase 3 couriers ====================
  getCourierConnections: <T extends Record<string, unknown> = Record<string, unknown>>() =>
    request<{ connections: T[]; supported_couriers: Array<Record<string, unknown>> }>('/api/courier/connections'),

  saveCourierConnection: (body: Record<string, unknown>) =>
    request<{ connections: Record<string, unknown>[] }>('/api/courier/connections', { method: 'POST', body: JSON.stringify(body) }),

  getCourierConnection: (provider: string) =>
    request<{ connection: Record<string, unknown>; supported_courier: Record<string, unknown> | null }>(`/api/courier/connections/${provider}`),

  testCourierConnection: (provider: string) =>
    request<{ ok: boolean; error?: string | null }>(`/api/courier/connections/${provider}`, { method: 'PATCH', body: JSON.stringify({ action: 'test' }) }),

  setCourierConnectionActive: (provider: string, active: boolean) =>
    request<{ connection: Record<string, unknown> | null }>(`/api/courier/connections/${provider}`, { method: 'PATCH', body: JSON.stringify({ active }) }),

  updateCourierConnection: (provider: string, body: Record<string, unknown>) =>
    request<{ connection: Record<string, unknown> }>(`/api/courier/connections/${provider}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteCourierConnection: (provider: string) =>
    request<{ ok: boolean }>(`/api/courier/connections/${provider}`, { method: 'DELETE' }),

  createProviderShipment: (orderId: string, body: Record<string, unknown>) =>
    request<{ fulfillment: Record<string, unknown>; package: Record<string, unknown>; idempotent?: boolean }>(`/api/orders/${orderId}/shipments`, { method: 'POST', body: JSON.stringify(body) }),

  courierPackageAction: (packageId: string, body: Record<string, unknown>) =>
    request<{ ok: boolean; action: string; result: Record<string, unknown>; package: Record<string, unknown> | null }>(`/api/courier/packages/${packageId}`, { method: 'PATCH', body: JSON.stringify(body) }),

  runCourierSync: (body: Record<string, unknown> = {}) =>
    request<{ scanned: number; synced: number; errors: number }>('/api/courier/sync', { method: 'POST', body: JSON.stringify(body) }),
}

function camelize(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

function camelizeDeep<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map(v => camelizeDeep(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[camelize(k)] = camelizeDeep(v)
    return out as T
  }
  return value as T
}

// ... existing code continues below
