import { ImageResponse } from 'next/og'

// Edge runtime: the Node build of @vercel/og resolves its bundled font via
// fileURLToPath(path.join(import.meta.url, ...)), which breaks on Windows
// (path.join mangles the file:// URL -> "Invalid URL"). The Edge build bundles
// fonts inline and is the recommended runtime for OG image generation.
export const runtime = 'edge'

export const alt = 'ToroPay — free UPI payment links, QR codes, and hosted checkout for Indian businesses'
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
          background: 'linear-gradient(160deg, #fdf8f0 0%, #f5ede3 100%)',
          padding: '72px 80px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: '#7bb86c',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 44,
              fontWeight: 800,
            }}
          >
            T
          </div>
          <div style={{ display: 'flex', fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', color: '#2c2c2c' }}>
            Toro<span style={{ color: '#7bb86c' }}>Pay</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              fontSize: 62,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              color: '#2c2c2c',
              maxWidth: 1000,
            }}
          >
            Free UPI payment links for Indian businesses
          </div>
          <div style={{ fontSize: 30, color: '#6b6763', maxWidth: 940 }}>
            Branded payment links, QR codes &amp; hosted checkout — paid directly to your own UPI ID.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 26, color: '#8a8580' }}>
          <span>www.toropay.co.in</span>
          <span>No transaction fees · No website needed</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
