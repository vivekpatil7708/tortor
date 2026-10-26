import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  googleSheetsConnection: {
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  },
  googleSheetsExport: {
    createMany: vi.fn(),
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  transaction: { findFirst: vi.fn(), findMany: vi.fn() },
  payment: { findFirst: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => {}) }))

import { decryptSecret, encryptSecret } from '@/lib/couriers/crypto'
import {
  buildGoogleAuthUrl,
  googleRedirectUri,
  parseSpreadsheetId,
  paymentSheetRow,
  transactionSheetRow,
} from './google-sheets/client'
import {
  exportTransactionToSheets,
  exportTransactionsToSheets,
  getGoogleSheetsStatus,
  getValidAccessToken,
  isMissingGoogleSheetsTable,
  saveGoogleSheetsSpreadsheet,
} from './google-sheets/service'

process.env.APP_ENCRYPTION_KEY = 'google-sheets-test-key'

const fetchMock = vi.fn()

function response(body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn1',
    merchantId: 'm1',
    googleEmail: 'owner@example.com',
    accessTokenEncrypted: encryptSecret('access-token'),
    refreshTokenEncrypted: encryptSecret('refresh-token'),
    tokenExpiresAt: new Date(Date.now() + 60 * 60_000),
    scopes: '[]',
    spreadsheetId: 'sheet1234567890',
    spreadsheetName: 'ToroPay',
    sheetName: 'Transactions',
    autoExport: true,
    lastExportedAt: null,
    lastError: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  }
}

function transaction(id = 't1') {
  return {
    id,
    txnId: id === 't1' ? 'TXN1' : 'TXN2',
    amount: id === 't1' ? 499.5 : 1200,
    customerName: id === 't1' ? 'Asha' : 'Ravi',
    customerPhone: id === 't1' ? '9876543210' : '9123456780',
    status: 'success',
    confirmedAt: new Date('2026-10-27T04:30:00Z'),
    createdAt: new Date('2026-10-27T04:00:00Z'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(response())
  vi.stubGlobal('fetch', fetchMock)

  db.googleSheetsConnection.findUnique.mockResolvedValue(connection())
  db.googleSheetsConnection.update.mockResolvedValue(connection())
  db.googleSheetsExport.createMany.mockImplementation(async (args: { data: Array<{ id: string }> }) => ({
    count: args.data.length,
  }))
  db.googleSheetsExport.findMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
    args.where.id.in.map(id => ({ id })))
  db.googleSheetsExport.deleteMany.mockResolvedValue({ count: 0 })
  db.transaction.findFirst.mockResolvedValue(null)
  db.transaction.findMany.mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('Google OAuth', () => {
  it('asks for offline Sheets access and the exact callback', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client-id.apps.googleusercontent.com')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'client-secret')
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '')

    const url = new URL(buildGoogleAuthUrl('state-value', 'https://app.toropay.test/api/integrations/google-sheets/callback'))
    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('client_id')).toBe('client-id.apps.googleusercontent.com')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.toropay.test/api/integrations/google-sheets/callback')
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/spreadsheets')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('state-value')
  })

  it('derives the callback from the request, with an explicit override', () => {
    vi.stubEnv('GOOGLE_SHEETS_REDIRECT_URI', '')
    expect(googleRedirectUri(new Request('https://app.toropay.test/api/integrations/google-sheets/connect')))
      .toBe('https://app.toropay.test/api/integrations/google-sheets/callback')

    vi.stubEnv('GOOGLE_SHEETS_REDIRECT_URI', 'https://www.toropay.co.in/api/integrations/google-sheets/callback')
    expect(googleRedirectUri(new Request('https://internal.example/api/integrations/google-sheets/connect')))
      .toBe('https://www.toropay.co.in/api/integrations/google-sheets/callback')
  })
})

describe('Google Sheets links and rows', () => {
  it('accepts a spreadsheet URL or a bare ID', () => {
    expect(parseSpreadsheetId('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890/edit#gid=0'))
      .toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890')
    expect(parseSpreadsheetId('1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890'))
      .toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz1234567890')
    expect(parseSpreadsheetId('not a spreadsheet')).toBeNull()
    expect(parseSpreadsheetId('')).toBeNull()
  })

  it('builds the seven transaction columns', () => {
    const row = transactionSheetRow(transaction())
    expect(row[0]).toMatch(/2026/)
    expect(row.slice(1)).toEqual(['Asha', '9876543210', 499.5, 'TXN1', '', 'Success'])
  })

  it('builds an order payment row with its order ID', () => {
    const row = paymentSheetRow({
      paymentReference: 'PAY-REF-1',
      amount: 1200,
      orderNumber: 'ORD-1001',
      customerName: 'Ravi',
      customerPhone: '9123456780',
      status: 'paid',
      paidAt: new Date('2026-10-27T04:30:00Z'),
      createdAt: new Date('2026-10-27T04:00:00Z'),
    })
    expect(row.slice(1)).toEqual(['Ravi', '9123456780', 1200, 'PAY-REF-1', 'ORD-1001', 'Paid'])
  })
})

describe('automatic Google Sheets export', () => {
  it('appends a confirmed transaction once and records it', async () => {
    db.transaction.findFirst.mockResolvedValue(transaction())

    const result = await exportTransactionToSheets({ merchantId: 'm1', transactionId: 't1' })

    expect(result).toEqual({ exported: 1, skipped: 0 })
    expect(db.googleSheetsExport.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: [expect.objectContaining({ spreadsheetId: 'sheet1234567890', sourceType: 'transaction', sourceId: 't1' })],
    }))
    const append = fetchMock.mock.calls.find(([url]) => String(url).includes(':append'))
    expect(append).toBeTruthy()
    const body = JSON.parse(String(append?.[1]?.body))
    expect(body.values[0]).toEqual(expect.arrayContaining(['Asha', '9876543210', 499.5, 'TXN1', '', 'Success']))
  })

  it('does nothing when automatic export is off', async () => {
    db.googleSheetsConnection.findUnique.mockResolvedValue(connection({ autoExport: false }))

    const result = await exportTransactionToSheets({ merchantId: 'm1', transactionId: 't1' })

    expect(result.exported).toBe(0)
    expect(db.transaction.findFirst).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not append a row another request already reserved', async () => {
    db.transaction.findFirst.mockResolvedValue(transaction())
    db.googleSheetsExport.findMany.mockResolvedValue([]) // createMany skipped a concurrent duplicate

    const result = await exportTransactionToSheets({ merchantId: 'm1', transactionId: 't1' })

    expect(result).toEqual({ exported: 0, skipped: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refreshes an expired access token and saves it encrypted', async () => {
    const conn = connection({ tokenExpiresAt: new Date(Date.now() - 1000) })
    fetchMock.mockResolvedValueOnce(response({
      access_token: 'new-access-token',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
    }))

    const token = await getValidAccessToken(conn)

    expect(token).toBe('new-access-token')
    const update = db.googleSheetsConnection.update.mock.calls[0][0]
    expect(decryptSecret(update.data.accessTokenEncrypted)).toBe('new-access-token')
    expect(update.data.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('manual Google Sheets export', () => {
  it('exports the transactions matching the current filters', async () => {
    db.transaction.findMany.mockResolvedValue([transaction('t1'), transaction('t2')])

    const result = await exportTransactionsToSheets({
      merchantId: 'm1',
      filters: { status: 'success' },
    })

    expect(result).toMatchObject({ exported: 2, skipped: 0, matched: 2, truncated: false })
    expect(result.spreadsheet_url).toContain('sheet1234567890')
    expect(db.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'success', merchantId: 'm1' },
    }))
  })
})

describe('choosing a spreadsheet', () => {
  it('checks access and writes the header row when the tab is empty', async () => {
    fetchMock
      .mockResolvedValueOnce(response({
        spreadsheetId: 'newSheet123456',
        properties: { title: 'My Sheet' },
        sheets: [{ properties: { title: 'Sheet1' } }],
      }))
      .mockResolvedValueOnce(response({})) // A1:G1 has no values
      .mockResolvedValueOnce(response({})) // header written
    db.googleSheetsConnection.update.mockResolvedValue(connection({
      spreadsheetId: 'newSheet123456',
      spreadsheetName: 'My Sheet',
      sheetName: 'Sheet1',
    }))

    const saved = await saveGoogleSheetsSpreadsheet({
      session: { id: 'm1', accountId: 'a1', teamRole: 'owner' },
      spreadsheet: 'https://docs.google.com/spreadsheets/d/newSheet123456/edit',
    })

    expect(saved.spreadsheetId).toBe('newSheet123456')
    expect(saved.sheetName).toBe('Sheet1')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const update = db.googleSheetsConnection.update.mock.calls[0][0]
    expect(update.data).toMatchObject({
      spreadsheetId: 'newSheet123456',
      spreadsheetName: 'My Sheet',
      sheetName: 'Sheet1',
      lastError: null,
    })
  })

  it('rejects a link without a usable spreadsheet ID', async () => {
    await expect(saveGoogleSheetsSpreadsheet({
      session: { id: 'm1', accountId: 'a1', teamRole: 'owner' },
      spreadsheet: 'https://docs.google.com/spreadsheets/d/short',
    })).rejects.toThrow('Enter a Google Sheets link or spreadsheet ID.')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Google Sheets setup detection', () => {
  it('reports a missing migration instead of breaking Settings', async () => {
    const missing = Object.assign(new Error('table does not exist'), { code: 'P2021' })
    db.googleSheetsConnection.findUnique.mockRejectedValue(missing)

    const status = await getGoogleSheetsStatus({ id: 'm1', accountId: 'a1', teamRole: 'owner' })

    expect(isMissingGoogleSheetsTable(missing)).toBe(true)
    expect(status).toMatchObject({ available: false, setup_required: true, can_manage: true })
  })
})
