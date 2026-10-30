import { ImageResponse } from 'next/og'

// Edge runtime: the Node build of @vercel/og resolves its bundled font via
// fileURLToPath(path.join(import.meta.url, ...)), which breaks on Windows
// (path.join mangles the file:// URL -> "Invalid URL"). The Edge build bundles
// fonts inline and is the recommended runtime for OG image generation.
export const runtime = 'edge'

export const alt = 'ToroPay — free UPI payment links for Indian businesses'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// File-based social card: automatically wired into og:image (and used as the
// Twitter/X fallback). Blog posts override this with their own hero image.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0a0a0a',
          padding: '72px 80px',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -120,
            top: -150,
            width: 480,
            height: 480,
            borderRadius: '50%',
            background: '#60a5fa',
            opacity: 0.12,
            filter: 'blur(80px)',
            display: 'flex',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: '#60a5fa',
              color: '#0a0a0a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 44,
              fontWeight: 800,
            }}
          >
            T
          </div>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', color: '#ffffff' }}>
            Toro<span style={{ color: '#60a5fa' }}>Pay</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              fontSize: 62,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              color: '#ffffff',
              maxWidth: 1000,
            }}
          >
            Free UPI payment links. No payment gateway needed.
          </div>
          <div style={{ fontSize: 30, color: '#d4d4d4', maxWidth: 940 }}>
            Share a link or QR code and get paid directly to your own UPI ID. Free forever, with no transaction fees.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 26, color: '#8a8a8a' }}>
          <span>www.toropay.co.in</span>
          <span>No card details · No gateway · No transaction fees</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
