import { beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { SignJWT } from 'jose'
import { middleware } from '@/middleware'

const SECRET = 'test-secret-for-middleware-team-tests'
process.env.JWT_SECRET = SECRET

async function viewerToken() {
  return new SignJWT({ email: 'viewer@example.com', mid: 'm1', role: 'viewer', tmid: 'tm1', sv: 0 })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('a1')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(SECRET))
}

function request(path: string, token: string, method = 'POST') {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { cookie: `toropay_session=${token}` },
  })
}

beforeEach(() => {
  process.env.JWT_SECRET = SECRET
})

describe('viewer write restrictions', () => {
  it('blocks a viewer from changing merchant data', async () => {
    const token = await viewerToken()
    const res = await middleware(request('/api/orders', token))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('view-only') })
  })

  it('still lets a viewer read', async () => {
    const token = await viewerToken()
    const res = await middleware(request('/api/orders', token, 'GET'))
    expect(res.status).not.toBe(403)
  })

  it('lets a viewer accept an invitation to join a team', async () => {
    const token = await viewerToken()
    const res = await middleware(request('/api/team/accept', token))
    expect(res.status).not.toBe(403)
  })
})
