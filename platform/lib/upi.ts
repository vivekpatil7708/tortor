import { UPI_APPS } from './constants'

/**
 * A payee name as UPI apps show it: letters, numbers, spaces and simple punctuation, at most 50
 * characters. Letters include the vowel signs of Indian scripts (\p{M}), so "आशा" stays whole.
 */
export function cleanPayeeName(name: string | null | undefined): string {
  return (name || '').replace(/[^\p{L}\p{M}\p{N} .,&'()-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 50)
}

/**
 * The fields of a UPI payment request. `pn` (payee name) is what most UPI apps
 * show on the confirmation screen; NPCI's link format expects it.
 */
function upiParams(vpa: string, amount: number, txnId: string, note: string, payeeName?: string, withMode = true) {
  const params = new URLSearchParams({ pa: vpa })
  const pn = cleanPayeeName(payeeName)
  if (pn) params.set('pn', pn)
  params.set('am', amount.toFixed(2))
  params.set('cu', 'INR')
  if (withMode) params.set('mode', '01')
  params.set('tn', note.slice(0, 80))
  params.set('tr', txnId)
  return params
}

export function buildUpiPayUrl(vpa: string, amount: number, txnId: string, note: string, payeeName?: string) {
  return `upi://pay?${upiParams(vpa, amount, txnId, note, payeeName).toString()}`
}

export function buildUpiIntentUrl(vpa: string, amount: number, txnId: string, note: string, payeeName?: string) {
  return `intent://pay?${upiParams(vpa, amount, txnId, note, payeeName).toString()}#Intent;scheme=upi;end`
}

export function buildAppDeepLink(
  app: (typeof UPI_APPS)[number],
  vpa: string,
  amount: number,
  txnId: string,
  note: string,
  payeeName?: string
) {
  const params = upiParams(vpa, amount, txnId, note, payeeName, false)

  if (app.scheme === 'tez') {
    return `tez://upi/pay?${params.toString()}`
  }
  if (app.scheme === 'phonepe') {
    return `phonepe://pay?${params.toString()}`
  }
  if (app.scheme === 'paytmmp') {
    return `paytmmp://pay?${params.toString()}&featuretype=money_transfer`
  }
  return buildUpiPayUrl(vpa, amount, txnId, note, payeeName)
}

export function isValidVpa(vpa: string) {
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(vpa)
}

export async function verifyVpaWithSetu(vpa: string): Promise<{ valid: boolean; name?: string }> {
  const clientId = process.env.SETU_CLIENT_ID
  const clientSecret = process.env.SETU_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return { valid: isValidVpa(vpa) }
  }

  try {
    const base = process.env.SETU_BASE_URL || 'https://prod.setu.co'
    const res = await fetch(`${base}/api/verify/ban/validate-vpa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': clientId,
        'x-client-secret': clientSecret,
      },
      body: JSON.stringify({ vpa }),
    })
    if (!res.ok) return { valid: isValidVpa(vpa) }
    const data = await res.json()
    return { valid: data.valid === true || data.status === 'VALID', name: data.name }
  } catch {
    return { valid: isValidVpa(vpa) }
  }
}
