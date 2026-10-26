/**
 * Google Sheets REST helpers.
 *
 * ToroPay talks to Google directly with fetch so the app does not need the
 * googleapis package. Only the Sheets scope is requested: no Drive access is
 * needed because the merchant pastes a spreadsheet link (or creates a new
 * spreadsheet from Settings).
 */

export const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'
export const GOOGLE_SHEETS_SCOPES = ['openid', 'email', GOOGLE_SHEETS_SCOPE]

export const SHEET_HEADERS = [
  'Date',
  'Customer Name',
  'Phone',
  'Amount',
  'Payment Reference',
  'Order ID',
  'Status',
] as const

export type SheetRow = [string, string, string, number, string, string, string]

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets'
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
const REQUEST_TIMEOUT_MS = 15_000

export type GoogleTokenResult = {
  accessToken: string
  refreshToken: string | null
  expiresIn: number
  scope: string
}

export type SpreadsheetInfo = {
  id: string
  name: string
  sheetNames: string[]
}

export type TransactionSheetSource = {
  txnId: string
  amount: number
  customerName: string | null
  customerPhone: string | null
  status: string
  confirmedAt: Date | null
  createdAt: Date
}

export type PaymentSheetSource = {
  paymentReference: string
  amount: number
  orderNumber: string | null
  customerName: string | null
  customerPhone: string | null
  status: string
  paidAt: Date | null
  createdAt: Date
}

export function googleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
}

export function googleOAuthConfigured(): boolean {
  return Boolean(googleClientId() && process.env.GOOGLE_CLIENT_SECRET)
}

/** The exact callback URL that must be registered in the Google Cloud console. */
export function googleRedirectUri(req: Request): string {
  const explicit = process.env.GOOGLE_SHEETS_REDIRECT_URI?.trim()
  if (explicit) return explicit
  // Use the host the merchant is actually on. Behind a proxy where that host
  // differs from the public one, set GOOGLE_SHEETS_REDIRECT_URI explicitly.
  const base = new URL(req.url).origin.replace(/\/+$/, '')
  return `${base}/api/integrations/google-sheets/callback`
}

export function buildGoogleAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SHEETS_SCOPES.join(' '),
    access_type: 'offline',
    // Needed so a reconnect also returns a refresh token.
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

function oauthError(data: Record<string, unknown> | null): Error {
  const code = typeof data?.error === 'string' ? data.error : ''
  if (code === 'invalid_grant') {
    return new Error('Google access has expired. Reconnect Google Sheets in Settings.')
  }
  if (code === 'invalid_client') {
    return new Error('Google sign-in is not configured correctly. Contact support.')
  }
  return new Error('Google sign-in failed. Try again.')
}

async function tokenRequest(body: URLSearchParams): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new Error('Could not reach Google. Check your connection and try again.')
  }

  const data = await res.json().catch(() => null) as Record<string, unknown> | null
  if (!res.ok) throw oauthError(data)
  if (!data || typeof data.access_token !== 'string') throw oauthError(data)
  return data
}

function tokenResult(data: Record<string, unknown>): GoogleTokenResult {
  return {
    accessToken: String(data.access_token),
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
    expiresIn: Number.isFinite(Number(data.expires_in)) ? Number(data.expires_in) : 3600,
    scope: typeof data.scope === 'string' ? data.scope : GOOGLE_SHEETS_SCOPES.join(' '),
  }
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleTokenResult> {
  const data = await tokenRequest(new URLSearchParams({
    code,
    client_id: googleClientId(),
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }))
  return tokenResult(data)
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResult> {
  const data = await tokenRequest(new URLSearchParams({
    refresh_token: refreshToken,
    client_id: googleClientId(),
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    grant_type: 'refresh_token',
  }))
  return tokenResult(data)
}

/** Best effort: disconnecting must work even if Google is unreachable. */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    // The local connection is still removed.
  }
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = await res.json().catch(() => null) as Record<string, unknown> | null
    return typeof data?.email === 'string' ? data.email : null
  } catch {
    return null
  }
}

function googleFailure(status: number, action: string): Error {
  if (status === 401) return new Error('Google access has expired. Reconnect Google Sheets in Settings.')
  if (status === 403) {
    return new Error('The connected Google account cannot edit that spreadsheet. Check access or reconnect Google Sheets.')
  }
  if (status === 404) {
    return new Error('Spreadsheet not found. Check the link and that the connected Google account can open it.')
  }
  if (status === 429) return new Error('Google Sheets is busy right now. Try again in a minute.')
  if (status >= 500) return new Error('Google Sheets is temporarily unavailable. Try again shortly.')
  return new Error(`Google Sheets could not ${action}. Try again.`)
}

async function googleRequest(
  url: string,
  init: RequestInit,
  action: string,
): Promise<Record<string, unknown> | null> {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new Error('Could not reach Google Sheets. Check your connection and try again.')
  }
  const data = await res.json().catch(() => null) as Record<string, unknown> | null
  if (!res.ok) throw googleFailure(res.status, action)
  return data
}

/** Accepts a full Google Sheets URL or a bare spreadsheet ID. */
export function parseSpreadsheetId(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  const match = value.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)
  const candidate = match ? match[1] : value
  return /^[A-Za-z0-9_-]{10,200}$/.test(candidate) ? candidate : null
}

export function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
}

export async function getSpreadsheet(accessToken: string, spreadsheetId: string): Promise<SpreadsheetInfo> {
  const data = await googleRequest(
    `${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    'open that spreadsheet',
  )
  const id = typeof data?.spreadsheetId === 'string' ? data.spreadsheetId : spreadsheetId
  const properties = data?.properties as Record<string, unknown> | undefined
  const name = typeof properties?.title === 'string' ? properties.title : 'Google Sheet'
  const sheets = Array.isArray(data?.sheets) ? data.sheets : []
  const sheetNames = sheets
    .map(sheet => {
      const props = (sheet as Record<string, unknown>)?.properties as Record<string, unknown> | undefined
      return typeof props?.title === 'string' ? props.title : ''
    })
    .filter(Boolean)
  return { id, name, sheetNames }
}

export async function createSpreadsheet(accessToken: string, title: string): Promise<SpreadsheetInfo> {
  const data = await googleRequest(SHEETS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: 'Transactions' } }],
    }),
  }, 'create a spreadsheet')

  const id = typeof data?.spreadsheetId === 'string' ? data.spreadsheetId : ''
  if (!id) throw new Error('Google did not return the new spreadsheet. Try again.')
  const properties = data?.properties as Record<string, unknown> | undefined
  const sheets = Array.isArray(data?.sheets) ? data.sheets : []
  const first = sheets[0] as Record<string, unknown> | undefined
  const firstProps = first?.properties as Record<string, unknown> | undefined
  return {
    id,
    name: typeof properties?.title === 'string' ? properties.title : title,
    sheetNames: [typeof firstProps?.title === 'string' ? firstProps.title : 'Transactions'],
  }
}

function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

function a1Range(sheetName: string, cells: string): string {
  return `${quoteSheetName(sheetName)}!${cells}`
}

/** Write the header row only when the first row is empty. */
export async function ensureSheetHeader(accessToken: string, spreadsheetId: string, sheetName: string): Promise<void> {
  const range = a1Range(sheetName, 'A1:G1')
  const existing = await googleRequest(
    `${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    'read that spreadsheet',
  )
  const firstRow = Array.isArray(existing?.values) ? existing.values[0] : null
  if (Array.isArray(firstRow) && firstRow.some(value => String(value).trim() !== '')) return

  await googleRequest(
    `${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [[...SHEET_HEADERS]] }),
    },
    'write the header row',
  )
}

/** Append rows in one request. RAW keeps customer text from becoming a formula. */
export async function appendSheetRows(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  rows: SheetRow[],
): Promise<void> {
  if (!rows.length) return
  const range = a1Range(sheetName, 'A1')
  await googleRequest(
    `${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    },
    'add rows to the spreadsheet',
  )
}

const SHEET_DATE = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
})

export function sheetDate(at: Date): string {
  return SHEET_DATE.format(at)
}

function statusLabel(status: string): string {
  if (status === 'success') return 'Success'
  if (status === 'paid') return 'Paid'
  if (!status) return ''
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function transactionSheetRow(txn: TransactionSheetSource): SheetRow {
  return [
    sheetDate(txn.confirmedAt ?? txn.createdAt),
    txn.customerName || '',
    txn.customerPhone || '',
    Math.round(txn.amount * 100) / 100,
    txn.txnId,
    '',
    statusLabel(txn.status),
  ]
}

export function paymentSheetRow(payment: PaymentSheetSource): SheetRow {
  return [
    sheetDate(payment.paidAt ?? payment.createdAt),
    payment.customerName || '',
    payment.customerPhone || '',
    Math.round(payment.amount * 100) / 100,
    payment.paymentReference,
    payment.orderNumber || '',
    statusLabel(payment.status),
  ]
}
