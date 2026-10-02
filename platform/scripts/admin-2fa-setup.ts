/**
 * One-time setup for the admin authenticator code.
 *
 *   cd platform
 *   npx tsx scripts/admin-2fa-setup.ts you@example.com
 *
 * Prints a new secret and a QR code. Scan the QR code with Google Authenticator
 * or Authy (or enter the secret as a "setup key"), then add the secret in Vercel
 * as ADMIN_TOTP_SECRET (Production) and redeploy. The script saves nothing;
 * keep the secret private.
 */
import QRCode from 'qrcode'
import { generateTotpSecret, otpauthUri } from '../lib/totp'

async function main() {
  const account = process.argv[2] || 'admin'
  const secret = generateTotpSecret()
  const qr = await QRCode.toString(otpauthUri(secret, account), { type: 'terminal' })

  console.log(qr)
  console.log(`ADMIN_TOTP_SECRET=${secret}`)
  console.log('\n1. Scan the QR code above with your authenticator app (or enter the secret as a setup key).')
  console.log('2. In Vercel: Project tortor -> Settings -> Environment Variables -> add ADMIN_TOTP_SECRET for Production.')
  console.log('3. Redeploy, then open /admin and enter the 6-digit code from the app.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
