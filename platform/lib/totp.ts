import crypto from 'crypto'

/**
 * Time-based one-time codes (RFC 6238): the 6-digit codes shown by Google
 * Authenticator, Authy and similar apps. SHA-1, 30-second steps.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

export function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (let i = 0; i < buffer.length; i++) {
    value = ((value << 8) | buffer[i]) & 0xffff
    bits += 8
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]
  return output
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    value = ((value << 5) | ALPHABET.indexOf(char)) & 0xffff
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/** A new random secret (160 bits), in the base32 form authenticator apps expect. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20))
}

function hotp(key: Buffer, counter: number, digits: number): string {
  const message = Buffer.alloc(8)
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  message.writeUInt32BE(counter >>> 0, 4)
  const hmac = crypto.createHmac('sha1', key).update(message).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const binary =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(binary % 10 ** digits).padStart(digits, '0')
}

export function totpCode(secret: string, timeMs = Date.now(), digits = DIGITS): string {
  return hotp(base32Decode(secret), Math.floor(timeMs / 1000 / STEP_SECONDS), digits)
}

/** Accepts the current code or one step either side, to allow for clock drift. */
export function verifyTotp(secret: string, code: string, timeMs = Date.now()): boolean {
  const clean = String(code).replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return false
  let valid = false
  for (const drift of [-1, 0, 1]) {
    const expected = totpCode(secret, timeMs + drift * STEP_SECONDS * 1000)
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) valid = true
  }
  return valid
}

/** The link an authenticator app reads from a QR code. */
export function otpauthUri(secret: string, account: string, issuer = 'ToroPay'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
}
