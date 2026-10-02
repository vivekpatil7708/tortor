import { SignJWT, jwtVerify } from 'jose'
import { Resend } from 'resend'
import { renderVerifyEmail } from '@/lib/email'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const fromAddress = process.env.RESEND_FROM || 'ToroPay <onboarding@resend.dev>'

export const EMAIL_NOT_VERIFIED =
  'Please verify your email address first. Check your inbox for the link, or resend it from your dashboard.'

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not set')
  return new TextEncoder().encode(secret)
}

/** Signed link token: whoever opens it received mail at `email`. Valid for 48 hours. */
export async function createEmailVerificationToken(merchantId: string, email: string): Promise<string> {
  return new SignJWT({ purpose: 'verify_email', email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(merchantId)
    .setIssuedAt()
    .setExpirationTime('48h')
    .sign(getSecret())
}

export async function readEmailVerificationToken(token: string): Promise<{ merchantId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (payload.purpose !== 'verify_email' || !payload.sub || typeof payload.email !== 'string') return null
    return { merchantId: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

/** Email the verification link. Returns false when it could not be sent. */
export async function sendVerificationEmail(merchant: { id: string; email: string }): Promise<boolean> {
  if (!resend) {
    console.error('Verification email not sent: RESEND_API_KEY is not set')
    return false
  }
  const token = await createEmailVerificationToken(merchant.id, merchant.email)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: merchant.email,
      subject: 'Verify your ToroPay email',
      html: renderVerifyEmail({ verifyLink: `${baseUrl}/verify-email?token=${token}` }),
    })
    if (error) {
      console.error('Verification email failed:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('Verification email failed:', err)
    return false
  }
}
