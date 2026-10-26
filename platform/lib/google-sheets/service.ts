import crypto from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import { Prisma, type GoogleSheetsConnection } from '@prisma/client'
import { after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { decryptSecret, encryptSecret } from '@/lib/couriers/crypto'
import { isOwnerRole } from '@/lib/team-roles'
import {
  GOOGLE_SHEETS_SCOPE,
  appendSheetRows,
  createSpreadsheet,
  ensureSheetHeader,
  exchangeGoogleCode,
  fetchGoogleEmail,
  getSpreadsheet,
  googleOAuthConfigured,
  parseSpreadsheetId,
  paymentSheetRow,
  refreshGoogleAccessToken,
  revokeGoogleToken,
  spreadsheetUrl,
  transactionSheetRow,
  type SheetRow,
} from './client'

/**
 * Google Sheets connection and export.
 *
 * The connection is per merchant. Confirming a payment only schedules this
 * work after the response has been sent, so a slow or broken Google API can
 * never fail a payment. Automatic rows and manual exports share one export log,
 * which keeps retries and duplicate webhooks from adding the same payment twice.
 */

export const GOOGLE_SHEETS_SETUP_MESSAGE =
  'Google Sheets is not set up yet. Run platform/prisma/migrations/add_google_sheets.sql and try again.'

const OAUTH_STATE_PURPOSE = 'google_sheets_oauth'
const OAUTH_STATE_MINUTES = 10
const MANUAL_EXPORT_LIMIT = 5000

export type GoogleSheetsSession = {
  id: string
  accountId: string
  teamRole?: string | null
  teamMemberId?: string | null
}

export type GoogleSheetsOAuthState = {
  merchantId: string
  accountId: string
  teamMemberId: string | null
}

export function isMissingGoogleSheetsTable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err.code === 'P2021' || err.code === 'P2022')
  )
}

function stateSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('Google Sheets sign-in is unavailable. Try again later.')
  return new TextEncoder().encode(secret)
}

export async function createGoogleOAuthState(session: GoogleSheetsSession): Promise<string> {
  return new SignJWT({
    purpose: OAUTH_STATE_PURPOSE,
    mid: session.id,
    sub: session.accountId,
    tmid: session.teamMemberId ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_STATE_MINUTES}m`)
    .sign(stateSecret())
}

export async function readGoogleOAuthState(state: string): Promise<GoogleSheetsOAuthState | null> {
  try {
    const { payload } = await jwtVerify(state, stateSecret())
    if (payload.purpose !== OAUTH_STATE_PURPOSE) return null
    if (typeof payload.mid !== 'string' || typeof payload.sub !== 'string') return null
    return {
      merchantId: payload.mid,
      accountId: payload.sub,
      teamMemberId: typeof payload.tmid === 'string' ? payload.tmid : null,
    }
  } catch {
    return null
  }
}

function encryptToken(token: string): string {
  try {
    return encryptSecret(token)
  } catch {
    throw new Error('Google Sheets could not store the connection securely. Contact support.')
  }
}

function decryptToken(envelope: string): string {
  try {
    return decryptSecret(envelope)
  } catch {
    throw new Error('Google connection could not be read. Reconnect Google Sheets in Settings.')
  }
}

export function serializeGoogleSheetsConnection(conn: GoogleSheetsConnection) {
  return {
    id: conn.id,
    google_email: conn.googleEmail,
    spreadsheet_id: conn.spreadsheetId,
    spreadsheet_name: conn.spreadsheetName,
    spreadsheet_url: conn.spreadsheetId ? spreadsheetUrl(conn.spreadsheetId) : null,
    sheet_name: conn.sheetName,
    auto_export: conn.autoExport,
    connected_at: conn.createdAt.toISOString(),
    last_exported_at: conn.lastExportedAt?.toISOString() ?? null,
    last_error: conn.lastError,
  }
}

export async function getGoogleSheetsStatus(session: GoogleSheetsSession) {
  const configured = googleOAuthConfigured()
  const base = {
    available: true,
    configured,
    can_manage: isOwnerRole(session.teamRole),
    can_export: false,
    connected: false,
    connection: null as ReturnType<typeof serializeGoogleSheetsConnection> | null,
    setup_required: false,
  }

  try {
    const conn = await prisma.googleSheetsConnection.findUnique({ where: { merchantId: session.id } })
    return {
      ...base,
      connected: Boolean(conn),
      can_export: Boolean(conn?.spreadsheetId) && session.teamRole !== 'viewer',
      connection: conn ? serializeGoogleSheetsConnection(conn) : null,
    }
  } catch (err) {
    if (isMissingGoogleSheetsTable(err)) {
      return { ...base, available: false, setup_required: true }
    }
    throw err
  }
}

export async function connectGoogleAccount(params: {
  session: GoogleSheetsSession
  code: string
  redirectUri: string
}): Promise<GoogleSheetsConnection> {
  const tokens = await exchangeGoogleCode(params.code, params.redirectUri)
  if (!tokens.scope.split(/\s+/).includes(GOOGLE_SHEETS_SCOPE)) {
    throw new Error('Google Sheets access was not granted. Try again and allow access to Sheets.')
  }
  const email = await fetchGoogleEmail(tokens.accessToken)
  const existing = await prisma.googleSheetsConnection.findUnique({
    where: { merchantId: params.session.id },
  })

  // A different Google account may not be able to see the old spreadsheet.
  const accountChanged = Boolean(
    existing?.googleEmail && email && existing.googleEmail.toLowerCase() !== email.toLowerCase(),
  )

  const data = {
    googleEmail: email,
    accessTokenEncrypted: encryptToken(tokens.accessToken),
    refreshTokenEncrypted: tokens.refreshToken
      ? encryptToken(tokens.refreshToken)
      : existing?.refreshTokenEncrypted ?? null,
    tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    scopes: JSON.stringify(tokens.scope.split(/\s+/).filter(Boolean)),
    lastError: null,
    ...(accountChanged
      ? { spreadsheetId: null, spreadsheetName: null, sheetName: 'Transactions' }
      : {}),
  }

  const conn = await prisma.googleSheetsConnection.upsert({
    where: { merchantId: params.session.id },
    create: { merchantId: params.session.id, autoExport: true, ...data },
    update: data,
  })

  await logAudit({
    merchantId: params.session.id,
    action: 'google_sheets_connected',
    entityType: 'google_sheets_connection',
    entityId: conn.id,
    metadata: { google_email: email },
  }).catch(() => {})

  return conn
}

/** A current access token, refreshing it (and saving the new envelope) if needed. */
export async function getValidAccessToken(conn: GoogleSheetsConnection): Promise<string> {
  if (conn.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return decryptToken(conn.accessTokenEncrypted)
  }
  if (!conn.refreshTokenEncrypted) {
    throw new Error('Google access has expired. Reconnect Google Sheets in Settings.')
  }

  const refreshToken = decryptToken(conn.refreshTokenEncrypted)
  const tokens = await refreshGoogleAccessToken(refreshToken)
  const accessTokenEncrypted = encryptToken(tokens.accessToken)
  const refreshTokenEncrypted = tokens.refreshToken
    ? encryptToken(tokens.refreshToken)
    : conn.refreshTokenEncrypted

  await prisma.googleSheetsConnection.update({
    where: { id: conn.id },
    data: {
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      ...(tokens.scope
        ? { scopes: JSON.stringify(tokens.scope.split(/\s+/).filter(Boolean)) }
        : {}),
    },
  })

  return tokens.accessToken
}

export async function saveGoogleSheetsSpreadsheet(params: {
  session: GoogleSheetsSession
  spreadsheet?: string
  sheetName?: string
  autoExport?: boolean
}): Promise<GoogleSheetsConnection> {
  const conn = await prisma.googleSheetsConnection.findUnique({
    where: { merchantId: params.session.id },
  })
  if (!conn) throw new Error('Connect Google Sheets in Settings first.')

  const data: Prisma.GoogleSheetsConnectionUpdateInput = {}
  if (params.autoExport !== undefined) data.autoExport = params.autoExport

  if (params.spreadsheet !== undefined) {
    const spreadsheetId = parseSpreadsheetId(params.spreadsheet)
    if (!spreadsheetId) throw new Error('Enter a Google Sheets link or spreadsheet ID.')

    const accessToken = await getValidAccessToken(conn)
    const info = await getSpreadsheet(accessToken, spreadsheetId)
    const sameSpreadsheet = conn.spreadsheetId === spreadsheetId
    const sheetName = params.sheetName
      ? info.sheetNames.includes(params.sheetName) ? params.sheetName : null
      : sameSpreadsheet && info.sheetNames.includes(conn.sheetName)
        ? conn.sheetName
        : info.sheetNames.includes('Transactions') ? 'Transactions' : info.sheetNames[0]
    if (!sheetName) throw new Error('That spreadsheet has no tab to write to.')

    await ensureSheetHeader(accessToken, spreadsheetId, sheetName)
    data.spreadsheetId = spreadsheetId
    data.spreadsheetName = info.name
    data.sheetName = sheetName
    data.lastError = null
  }

  if (Object.keys(data).length === 0) {
    throw new Error('Choose a spreadsheet or an option to save.')
  }

  const saved = await prisma.googleSheetsConnection.update({
    where: { merchantId: params.session.id },
    data,
  })

  if (data.spreadsheetId) {
    await logAudit({
      merchantId: params.session.id,
      action: 'google_sheets_spreadsheet_changed',
      entityType: 'google_sheets_connection',
      entityId: saved.id,
      metadata: { spreadsheet_id: saved.spreadsheetId, sheet_name: saved.sheetName },
    }).catch(() => {})
  }

  return saved
}

export async function createGoogleSheetsSpreadsheet(params: {
  session: GoogleSheetsSession
  title?: string
}): Promise<GoogleSheetsConnection> {
  const conn = await prisma.googleSheetsConnection.findUnique({
    where: { merchantId: params.session.id },
  })
  if (!conn) throw new Error('Connect Google Sheets in Settings first.')

  const title = (params.title || 'ToroPay Transactions').trim().slice(0, 100) || 'ToroPay Transactions'
  const accessToken = await getValidAccessToken(conn)
  const info = await createSpreadsheet(accessToken, title)
  const sheetName = info.sheetNames[0] || 'Transactions'
  await ensureSheetHeader(accessToken, info.id, sheetName)

  const saved = await prisma.googleSheetsConnection.update({
    where: { merchantId: params.session.id },
    data: {
      spreadsheetId: info.id,
      spreadsheetName: info.name,
      sheetName,
      lastError: null,
    },
  })

  await logAudit({
    merchantId: params.session.id,
    action: 'google_sheets_spreadsheet_created',
    entityType: 'google_sheets_connection',
    entityId: saved.id,
    metadata: { spreadsheet_id: saved.spreadsheetId, sheet_name: saved.sheetName },
  }).catch(() => {})

  return saved
}

export async function disconnectGoogleSheets(session: GoogleSheetsSession): Promise<void> {
  const conn = await prisma.googleSheetsConnection.findUnique({
    where: { merchantId: session.id },
  })
  if (!conn) return

  try {
    const token = conn.refreshTokenEncrypted
      ? decryptToken(conn.refreshTokenEncrypted)
      : decryptToken(conn.accessTokenEncrypted)
    await revokeGoogleToken(token)
  } catch {
    // A local delete is enough; the access token expires on its own.
  }

  await prisma.googleSheetsConnection.delete({ where: { merchantId: session.id } })
  await logAudit({
    merchantId: session.id,
    action: 'google_sheets_disconnected',
    entityType: 'google_sheets_connection',
    entityId: conn.id,
  }).catch(() => {})
}

type ExportItem = { id: string; row: SheetRow }

async function appendUniqueRows(params: {
  conn: GoogleSheetsConnection
  sourceType: 'transaction' | 'order_payment'
  items: ExportItem[]
}): Promise<{ exported: number; skipped: number }> {
  const spreadsheetId = params.conn.spreadsheetId
  if (!spreadsheetId) throw new Error('Choose a spreadsheet in Settings before exporting.')

  // Reserve each row before calling Google. The unique key makes concurrent
  // confirmations and repeated manual exports add a payment only once.
  const ids = params.items.map(() => crypto.randomUUID())
  let appended = false

  try {
    await prisma.googleSheetsExport.createMany({
      data: params.items.map((item, index) => ({
        id: ids[index],
        merchantId: params.conn.merchantId,
        spreadsheetId,
        sourceType: params.sourceType,
        sourceId: item.id,
      })),
      skipDuplicates: true,
    })

    // Only the IDs this request actually inserted may be appended. A row that
    // another request already exported is silently skipped.
    const inserted = await prisma.googleSheetsExport.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    })
    const insertedIds = new Set(inserted.map(row => row.id))
    const rows = params.items
      .filter((_item, index) => insertedIds.has(ids[index]))
      .map(item => item.row)

    if (!rows.length) {
      return { exported: 0, skipped: params.items.length }
    }

    const accessToken = await getValidAccessToken(params.conn)
    await appendSheetRows(accessToken, spreadsheetId, params.conn.sheetName, rows)
    appended = true

    await prisma.googleSheetsConnection.update({
      where: { id: params.conn.id },
      data: { lastExportedAt: new Date(), lastError: null },
    }).catch(() => {})

    return { exported: rows.length, skipped: params.items.length - rows.length }
  } catch (err) {
    // If Google rejected the append, release the reservation so a later retry
    // can try again. A reservation that was never inserted is harmless to delete.
    if (!appended) {
      await prisma.googleSheetsExport.deleteMany({ where: { id: { in: ids } } }).catch(() => {})
    }
    const message = err instanceof Error ? err.message : 'Could not add rows to Google Sheets.'
    await prisma.googleSheetsConnection.update({
      where: { id: params.conn.id },
      data: { lastError: message.slice(0, 300) },
    }).catch(() => {})
    throw err
  }
}

/** A confirmed payment-link transaction. */
export async function exportTransactionToSheets(params: {
  merchantId: string
  transactionId: string
}): Promise<{ exported: number; skipped: number }> {
  const conn = await prisma.googleSheetsConnection.findUnique({
    where: { merchantId: params.merchantId },
  })
  if (!conn || !conn.autoExport || !conn.spreadsheetId) {
    return { exported: 0, skipped: 0 }
  }

  const txn = await prisma.transaction.findFirst({
    where: { id: params.transactionId, merchantId: params.merchantId },
    select: {
      id: true,
      txnId: true,
      amount: true,
      customerName: true,
      customerPhone: true,
      status: true,
      confirmedAt: true,
      createdAt: true,
    },
  })
  if (!txn || txn.status !== 'success') return { exported: 0, skipped: 0 }

  return appendUniqueRows({
    conn,
    sourceType: 'transaction',
    items: [{ id: txn.id, row: transactionSheetRow(txn) }],
  })
}

const paymentForSheetInclude = Prisma.validator<Prisma.PaymentInclude>()({
  order: {
    include: {
      customer: { select: { fullName: true, phone: true } },
    },
  },
})

type PaymentForSheet = Prisma.PaymentGetPayload<{ include: typeof paymentForSheetInclude }>

function snapshotText(
  value: Prisma.JsonValue | null,
  keys: string[],
): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const text = record[key]
    if (typeof text === 'string' && text.trim()) return text.trim()
  }
  return null
}

function paymentContact(payment: PaymentForSheet): { name: string | null; phone: string | null } {
  const order = payment.order
  if (!order) return { name: null, phone: null }
  const snapshots = [order.shippingAddressSnapshot, order.billingAddressSnapshot]
  const snapshotName = snapshots
    .map(snapshot => snapshotText(snapshot, ['fullName', 'name', 'customerName']))
    .find(Boolean) ?? null
  const snapshotPhone = snapshots
    .map(snapshot => snapshotText(snapshot, ['phone', 'customerPhone', 'mobile']))
    .find(Boolean) ?? null
  return {
    name: order.customer?.fullName || snapshotName,
    phone: order.customer?.phone || snapshotPhone,
  }
}

/** An order payment settled by a provider, webhook or manual confirmation. */
export async function exportPaymentToSheets(params: {
  merchantId: string
  paymentId: string
}): Promise<{ exported: number; skipped: number }> {
  const conn = await prisma.googleSheetsConnection.findUnique({
    where: { merchantId: params.merchantId },
  })
  if (!conn || !conn.autoExport || !conn.spreadsheetId) {
    return { exported: 0, skipped: 0 }
  }

  const payment = await prisma.payment.findFirst({
    where: { id: params.paymentId, merchantId: params.merchantId },
    include: paymentForSheetInclude,
  })
  if (!payment || payment.status !== 'paid') return { exported: 0, skipped: 0 }

  const contact = paymentContact(payment)
  return appendUniqueRows({
    conn,
    sourceType: 'order_payment',
    items: [{
      id: payment.id,
      row: paymentSheetRow({
        paymentReference: payment.paymentReference,
        amount: payment.amount.toNumber(),
        orderNumber: payment.order?.orderNumber ?? null,
        customerName: contact.name,
        customerPhone: contact.phone,
        status: payment.status,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
      }),
    }],
  })
}

/** Manual export from the Transactions page, using the current list filters. */
export async function exportTransactionsToSheets(params: {
  merchantId: string
  filters: Prisma.TransactionWhereInput
}): Promise<{
  exported: number
  skipped: number
  matched: number
  truncated: boolean
  spreadsheet_name: string | null
  sheet_name: string
  spreadsheet_url: string
}> {
  const conn = await prisma.googleSheetsConnection.findUnique({
    where: { merchantId: params.merchantId },
  })
  if (!conn) throw new Error('Connect Google Sheets in Settings before exporting.')
  if (!conn.spreadsheetId) throw new Error('Choose a spreadsheet in Settings before exporting.')

  const transactions = await prisma.transaction.findMany({
    where: { ...params.filters, merchantId: params.merchantId },
    // Keep the newest payments when a filter matches more than the limit.
    // Rows are reversed below so the sheet stays oldest-to-newest.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MANUAL_EXPORT_LIMIT + 1,
  })
  const truncated = transactions.length > MANUAL_EXPORT_LIMIT
  const page = (truncated ? transactions.slice(0, MANUAL_EXPORT_LIMIT) : transactions).reverse()
  const result = page.length
    ? await appendUniqueRows({
        conn,
        sourceType: 'transaction',
        items: page.map(txn => ({ id: txn.id, row: transactionSheetRow(txn) })),
      })
    : { exported: 0, skipped: 0 }

  return {
    ...result,
    matched: page.length,
    truncated,
    spreadsheet_name: conn.spreadsheetName,
    sheet_name: conn.sheetName,
    spreadsheet_url: spreadsheetUrl(conn.spreadsheetId),
  }
}

/**
 * Queue work after the response. If Next's request scope is unavailable (for
 * example in a unit test), run it directly and still never let it fail the
 * payment confirmation.
 */
function scheduleAfter(task: () => Promise<void>): void {
  try {
    after(task)
  } catch {
    void task()
  }
}

export function queueTransactionSheetExport(merchantId: string, transactionId: string): void {
  scheduleAfter(async () => {
    try {
      await exportTransactionToSheets({ merchantId, transactionId })
    } catch (err) {
      // A missing migration is expected until an admin runs it; it should not
      // fill the logs for every payment.
      if (isMissingGoogleSheetsTable(err)) return
      console.error(
        'Google Sheets transaction export failed:',
        err instanceof Error ? err.message : 'unknown error',
      )
    }
  })
}

export function queuePaymentSheetExport(merchantId: string, paymentId: string): void {
  scheduleAfter(async () => {
    try {
      await exportPaymentToSheets({ merchantId, paymentId })
    } catch (err) {
      if (isMissingGoogleSheetsTable(err)) return
      console.error(
        'Google Sheets payment export failed:',
        err instanceof Error ? err.message : 'unknown error',
      )
    }
  })
}
