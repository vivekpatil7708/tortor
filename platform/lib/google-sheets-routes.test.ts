import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireSession = vi.hoisted(() => vi.fn())
const getGoogleSheetsStatus = vi.hoisted(() => vi.fn())
const saveGoogleSheetsSpreadsheet = vi.hoisted(() => vi.fn())
const exportTransactionsToSheets = vi.hoisted(() => vi.fn())
const createGoogleSheetsSpreadsheet = vi.hoisted(() => vi.fn())
const disconnectGoogleSheets = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth', () => ({ requireSession }))
vi.mock('@/lib/google-sheets/service', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/google-sheets/service')>()
  return {
    ...actual,
    getGoogleSheetsStatus,
    saveGoogleSheetsSpreadsheet,
    exportTransactionsToSheets,
    createGoogleSheetsSpreadsheet,
    disconnectGoogleSheets,
  }
})

import { GET, PATCH } from '@/app/api/integrations/google-sheets/route'
import { POST as exportToSheets } from '@/app/api/integrations/google-sheets/export/route'

function connection() {
  return {
    id: 'conn1',
    merchantId: 'm1',
    googleEmail: 'owner@example.com',
    accessTokenEncrypted: 'never-return-this',
    refreshTokenEncrypted: 'never-return-this-either',
    tokenExpiresAt: new Date('2026-10-27T06:00:00Z'),
    scopes: '[]',
    spreadsheetId: 'sheet1234567890',
    spreadsheetName: 'ToroPay',
    sheetName: 'Transactions',
    autoExport: true,
    lastExportedAt: null,
    lastError: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireSession.mockResolvedValue({ id: 'm1', accountId: 'a1', teamRole: 'owner' })
  getGoogleSheetsStatus.mockResolvedValue({
    available: true,
    configured: true,
    can_manage: true,
    can_export: true,
    connected: true,
    connection: {},
    setup_required: false,
  })
  saveGoogleSheetsSpreadsheet.mockResolvedValue(connection())
  exportTransactionsToSheets.mockResolvedValue({
    exported: 2,
    skipped: 0,
    matched: 2,
    truncated: false,
    spreadsheet_name: 'ToroPay',
    sheet_name: 'Transactions',
    spreadsheet_url: 'https://docs.google.com/spreadsheets/d/sheet1234567890/edit',
  })
})

describe('GET /api/integrations/google-sheets', () => {
  it('returns the connection status without any token fields', async () => {
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.connected).toBe(true)
    expect(JSON.stringify(body)).not.toContain('never-return-this')
  })
})

describe('PATCH /api/integrations/google-sheets', () => {
  it('lets the owner turn automatic export off', async () => {
    const req = new NextRequest('http://localhost/api/integrations/google-sheets', {
      method: 'PATCH',
      body: JSON.stringify({ auto_export: false }),
    })

    const res = await PATCH(req)

    expect(res.status).toBe(200)
    expect(saveGoogleSheetsSpreadsheet).toHaveBeenCalledWith(expect.objectContaining({
      autoExport: false,
      session: expect.objectContaining({ id: 'm1' }),
    }))
    expect(JSON.stringify(await res.json())).not.toContain('never-return-this')
  })

  it('is owner-only', async () => {
    requireSession.mockResolvedValue({ id: 'm1', accountId: 'a1', teamRole: 'admin' })
    const req = new NextRequest('http://localhost/api/integrations/google-sheets', {
      method: 'PATCH',
      body: JSON.stringify({ auto_export: false }),
    })

    const res = await PATCH(req)

    expect(res.status).toBe(403)
    expect(saveGoogleSheetsSpreadsheet).not.toHaveBeenCalled()
  })
})

describe('POST /api/integrations/google-sheets/export', () => {
  it('uses the same filters as the transactions list', async () => {
    const req = new NextRequest('http://localhost/api/integrations/google-sheets/export', {
      method: 'POST',
      body: JSON.stringify({ status: 'success', from: '2026-10-01', q: 'Asha' }),
    })

    const res = await exportToSheets(req)

    expect(res.status).toBe(200)
    const args = exportTransactionsToSheets.mock.calls[0][0]
    expect(args.merchantId).toBe('m1')
    expect(args.filters.status).toBe('success')
    expect(args.filters.createdAt.gte).toBeInstanceOf(Date)
    expect(args.filters.OR).toBeTruthy()
  })

  it('rejects an unknown status before touching Google', async () => {
    const req = new NextRequest('http://localhost/api/integrations/google-sheets/export', {
      method: 'POST',
      body: JSON.stringify({ status: 'anything' }),
    })

    const res = await exportToSheets(req)

    expect(res.status).toBe(400)
    expect(exportTransactionsToSheets).not.toHaveBeenCalled()
  })

  it('tells the user to run the migration when the table is missing', async () => {
    exportTransactionsToSheets.mockRejectedValue(Object.assign(new Error('missing table'), { code: 'P2021' }))
    const req = new NextRequest('http://localhost/api/integrations/google-sheets/export', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const res = await exportToSheets(req)
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.error).toContain('add_google_sheets.sql')
  })

  it('blocks a viewer from writing to the sheet', async () => {
    requireSession.mockResolvedValue({ id: 'm1', accountId: 'a1', teamRole: 'viewer' })
    const req = new NextRequest('http://localhost/api/integrations/google-sheets/export', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const res = await exportToSheets(req)

    expect(res.status).toBe(403)
    expect(exportTransactionsToSheets).not.toHaveBeenCalled()
  })
})
