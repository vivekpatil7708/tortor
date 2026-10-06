import crypto from 'crypto'

/**
 * AES-256-GCM credentials encryption for courier connections and webhook
 * secrets. Keys are derived (SHA-256) from APP_ENCRYPTION_KEY, a key of its
 * own so a leak of the login secret doesn't expose courier passwords. Until
 * it is set, JWT_SECRET is used; anything saved that way stays readable after
 * APP_ENCRYPTION_KEY is added.
 *
 * Stored envelope format: `v1.<iv_b64>.<auth_tag_b64>.<ciphertext_b64>`
 */

const VERSION = 'v1'
const ALGO = 'aes-256-gcm'

function deriveKey(material: string): Buffer {
  return crypto.createHash('sha256').update(material).digest()
}

export function getEncryptionKey(): Buffer {
  const material = process.env.APP_ENCRYPTION_KEY || process.env.JWT_SECRET
  if (!material) throw new Error('APP_ENCRYPTION_KEY / JWT_SECRET is not configured')
  return deriveKey(material)
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.')
}

/** Keys to try when reading, newest first: JWT_SECRET covers data saved before APP_ENCRYPTION_KEY. */
function decryptionKeys(): Buffer[] {
  const materials = [process.env.APP_ENCRYPTION_KEY, process.env.JWT_SECRET].filter((m): m is string => Boolean(m))
  if (!materials.length) throw new Error('APP_ENCRYPTION_KEY / JWT_SECRET is not configured')
  return Array.from(new Set(materials)).map(deriveKey)
}

export function decryptSecret(envelope: string): string {
  const [version, ivB64, tagB64, dataB64] = envelope.split('.')
  if (version !== VERSION) throw new Error('Unsupported encryption envelope version')
  let lastError: unknown
  for (const key of decryptionKeys()) {
    try {
      const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'))
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
      return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value ?? {}))
}

export function decryptJson<T>(envelope: string): T {
  return JSON.parse(decryptSecret(envelope)) as T
}

/** Encrypt a single field but leave it visible if it is already an envelope. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}.`)
}