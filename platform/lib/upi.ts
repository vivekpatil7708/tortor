import { UPI_APPS } from './constants'

export function buildUpiPayUrl(vpa: string, amount: number, txnId: string, note: string) {
  const params = new URLSearchParams({
    pa: vpa,
    am: amount.toFixed(2),
    cu: 'INR',
    mode: '01',
    tn: note.slice(0, 80),
    tr: txnId,
  })
  return `upi://pay?${params.toString()}`
}

export function buildUpiIntentUrl(vpa: string, amount: number, txnId: string, note: string) {
  const params = new URLSearchParams({
    pa: vpa,
    am: amount.toFixed(2),
    cu: 'INR',
    mode: '01',
    tn: note.slice(0, 80),
    tr: txnId,
  })
  return `intent://pay?${params.toString()}#Intent;scheme=upi;end`
}

export function buildAppDeepLink(
  app: (typeof UPI_APPS)[number],
  vpa: string,
  amount: number,
  txnId: string,
  note: string
) {
  const params = new URLSearchParams({
    pa: vpa,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: note.slice(0, 80),
    tr: txnId,
  })

  if (app.scheme === 'tez') {
    return `tez://upi/pay?${params.toString()}`
  }
  if (app.scheme === 'phonepe') {
    return `phonepe://pay?${params.toString()}`
  }
  if (app.scheme === 'paytmmp') {
    return `paytmmp://pay?${params.toString()}&featuretype=money_transfer`
  }
  return buildUpiPayUrl(vpa, amount, txnId, note)
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
