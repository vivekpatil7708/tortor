// The support email and phone a business shows its customers (receipts, closed
// links, website checkout). Optional: an empty value clears it.

type Checked = { ok: true; value: string | null } | { ok: false; error: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^\+?[\d\s-]+$/

export function supportEmailInput(value: unknown): Checked {
  const email = String(value ?? '').trim()
  if (!email) return { ok: true, value: null }
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, error: 'Enter a valid support email, or leave it empty.' }
  return { ok: true, value: email }
}

/** Digits with an optional leading +, spaces and hyphens: "+91 98765 43210". */
export function supportPhoneInput(value: unknown): Checked {
  const phone = String(value ?? '').trim()
  if (!phone) return { ok: true, value: null }
  const digits = phone.replace(/\D/g, '').length
  if (phone.length > 20 || !PHONE.test(phone) || digits < 6) {
    return { ok: false, error: 'Enter a valid support phone number, or leave it empty.' }
  }
  return { ok: true, value: phone }
}
