import { afterEach, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from './couriers/crypto'
import { imageFileProblem, imageValueProblem } from './image-input'

const env = { ...process.env }
afterEach(() => {
  process.env = { ...env }
})

describe('courier password encryption key (#25)', () => {
  it('keeps reading data saved with the login secret after APP_ENCRYPTION_KEY is added', () => {
    process.env.JWT_SECRET = 'login-secret'
    delete process.env.APP_ENCRYPTION_KEY
    const saved = encryptSecret('courier-password')

    process.env.APP_ENCRYPTION_KEY = 'separate-key'
    expect(decryptSecret(saved)).toBe('courier-password')
  })

  it('encrypts new data with APP_ENCRYPTION_KEY, which the login secret alone cannot read', () => {
    process.env.JWT_SECRET = 'login-secret'
    process.env.APP_ENCRYPTION_KEY = 'separate-key'
    const saved = encryptSecret('courier-password')
    expect(decryptSecret(saved)).toBe('courier-password')

    delete process.env.APP_ENCRYPTION_KEY
    expect(() => decryptSecret(saved)).toThrow()
  })
})

describe('logo and background images (#30)', () => {
  const dataUrl = (type: string, bytes: number) => `data:${type};base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`

  it('accepts PNG, JPEG, WebP and GIF up to 1 MB, https links, and clearing the image', () => {
    expect(imageValueProblem(dataUrl('image/png', 500_000))).toBeNull()
    expect(imageValueProblem(dataUrl('image/webp', 1024 * 1024 - 3))).toBeNull()
    expect(imageValueProblem('https://abc.supabase.co/storage/logo.png')).toBeNull()
    expect(imageValueProblem('')).toBeNull()
    expect(imageValueProblem(null)).toBeNull()
  })

  it('refuses large images, other types and other kinds of links', () => {
    expect(imageValueProblem(dataUrl('image/png', 2_000_000))).toMatch(/1 MB/)
    expect(imageValueProblem(dataUrl('image/svg+xml', 1000))).toMatch(/PNG, JPEG/)
    expect(imageValueProblem('javascript:alert(1)')).toMatch(/PNG, JPEG/)
    expect(imageValueProblem('http://example.com/logo.png')).toMatch(/PNG, JPEG/)
  })

  it('checks a chosen file before it is uploaded', () => {
    expect(imageFileProblem({ type: 'image/jpeg', size: 300_000 })).toBeNull()
    expect(imageFileProblem({ type: 'image/jpeg', size: 3_000_000 })).toMatch(/larger than 1 MB/)
    expect(imageFileProblem({ type: 'image/svg+xml', size: 1000 })).toMatch(/PNG, JPEG/)
  })
})

describe('content security policy (#28)', () => {
  async function scriptSrc(nodeEnv: 'production' | 'development') {
    process.env = { ...process.env, NODE_ENV: nodeEnv }
    const { default: config } = await import('../next.config.js')
    const [{ headers }] = await config.headers!()
    const csp = headers.find((h: { key: string }) => h.key === 'Content-Security-Policy')!.value
    return csp.split('; ').find((part: string) => part.startsWith('script-src')) ?? ''
  }

  it("doesn't allow eval on the live site", async () => {
    expect(await scriptSrc('production')).not.toContain('unsafe-eval')
  })

  it('still allows it for local development', async () => {
    expect(await scriptSrc('development')).toContain('unsafe-eval')
  })
})
