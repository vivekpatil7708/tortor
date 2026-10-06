import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, fetchAllTransactions } from './api'

const assign = vi.fn()
const onPage = (pathname: string) => vi.stubGlobal('window', { location: { pathname, assign } })

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Answers each path (query string ignored) with the given response. */
function serverAnswers(answers: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (url: string) => {
    const answer = answers[url.split('?')[0]]
    if (!answer) throw new Error(`unexpected request ${url}`)
    return answer()
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** 'pending' if the promise hasn't settled shortly after everything else has run. */
const stateOf = (p: Promise<unknown>) =>
  Promise.race([p.then(() => 'settled', () => 'settled'), new Promise(r => setTimeout(() => r('pending'), 30))])

afterEach(() => {
  vi.unstubAllGlobals()
  assign.mockReset()
})

describe('a refused request on a signed-in page (B1)', () => {
  it('goes to the sign-out step when the login has really ended', async () => {
    onPage('/dashboard/links')
    serverAnswers({ '/api/links': json(401, { error: 'Unauthorized' }), '/api/auth/me': json(200, { merchant: null }) })

    const call = api.getLinks()

    expect(await stateOf(call)).toBe('pending') // no error flashes up while the page leaves
    expect(assign).toHaveBeenCalledWith('/api/auth/session-ended')
  })

  it('does the same during onboarding', async () => {
    onPage('/onboarding')
    serverAnswers({ '/api/upi': json(401, { error: 'Unauthorized' }), '/api/auth/me': json(200, { merchant: null }) })

    expect(await stateOf(api.getUpis())).toBe('pending')
    expect(assign).toHaveBeenCalledWith('/api/auth/session-ended')
  })

  it('shows the normal error when the login still works (some routes report any error as Unauthorized)', async () => {
    onPage('/dashboard')
    serverAnswers({ '/api/links': json(401, { error: 'Unauthorized' }), '/api/auth/me': json(200, { merchant: { id: 'm1' } }) })

    await expect(api.getLinks()).rejects.toThrow('Unauthorized')
    expect(assign).not.toHaveBeenCalled()
  })

  it('shows the normal error when the login check itself fails', async () => {
    onPage('/dashboard')
    serverAnswers({ '/api/links': json(401, { error: 'Unauthorized' }), '/api/auth/me': json(500, { error: 'Something went wrong' }) })

    await expect(api.getLinks()).rejects.toThrow('Unauthorized')
    expect(assign).not.toHaveBeenCalled()
  })

  it('never treats a wrong password on the login page as a sign-out', async () => {
    onPage('/login')
    const fetchMock = serverAnswers({ '/api/auth/login': json(401, { error: 'Invalid email or password' }) })

    await expect(api.login({ email: 'shop@example.com', password: 'wrong' })).rejects.toThrow('Invalid email or password')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(assign).not.toHaveBeenCalled()
  })
})

describe('transactions a page at a time (B5)', () => {
  it('asks for one page with the filters', async () => {
    const fetchMock = serverAnswers({ '/api/transactions/list': json(200, { transactions: [], next_cursor: null, total: 0 }) })

    await api.getTransactions({ status: 'pending', from: '2026-10-01', link: 'L1' })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/transactions/list?limit=50&status=pending&from=2026-10-01&link=L1')
  })

  it('collects every page for an export, not just the first', async () => {
    const pages = [
      { transactions: [{ id: 'a' }, { id: 'b' }], next_cursor: 'b', total: 5 },
      { transactions: [{ id: 'c' }, { id: 'd' }], next_cursor: 'd', total: null },
      { transactions: [{ id: 'e' }], next_cursor: null, total: null },
    ]
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(pages[fetchMock.mock.calls.length - 1]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const progress: Array<[number, number | null]> = []

    const rows = await fetchAllTransactions({ status: 'success' }, (loaded, total) => progress.push([loaded, total]))

    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(progress).toEqual([[2, 5], [4, 5], [5, 5]])
    expect(fetchMock.mock.calls.map(c => (c as unknown as [string])[0])).toEqual([
      '/api/transactions/list?limit=500&status=success',
      '/api/transactions/list?limit=500&cursor=b&status=success',
      '/api/transactions/list?limit=500&cursor=d&status=success',
    ])
  })
})
