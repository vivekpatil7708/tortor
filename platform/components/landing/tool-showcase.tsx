'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronRight,
  CreditCard,
  Link2,
  QrCode,
  Share2,
  Smile,
} from 'lucide-react'

const DEMO_PATH = '/pay/demo-booking'
const DEMO_URL = 'https://www.toropay.co.in/pay/demo-booking'

type ToolId = 'link' | 'qr' | 'checkout'

type Tool = {
  id: ToolId
  name: string
  detail: string
  icon: typeof Link2
  accent: string
}

const TOOLS: Tool[] = [
  {
    id: 'link',
    name: 'Payment links',
    detail: 'Fixed or custom amount',
    icon: Link2,
    accent: 'bg-sunlit-clay/15',
  },
  {
    id: 'qr',
    name: 'QR codes',
    detail: 'Scan or download',
    icon: QrCode,
    accent: 'bg-sunlit-clay/30',
  },
  {
    id: 'checkout',
    name: 'Branded checkout',
    detail: 'Logo, colours and UPI',
    icon: CreditCard,
    accent: 'bg-cornsilk/10',
  },
]

function ToolVisual({ active, qrSrc }: { active: ToolId; qrSrc: string | null }) {
  if (active === 'qr') {
    return (
      <a
        href={DEMO_PATH}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block w-full max-w-[14rem] rotate-2 rounded-2xl border border-black-forest/15 bg-cornsilk-800 p-3 shadow-2xl transition-transform hover:-rotate-1"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-black-forest">Scan to pay</p>
          <QrCode className="h-4 w-4 text-copperwood" aria-hidden />
        </div>
        {qrSrc ? (
          <img
            src={qrSrc}
            alt="QR code for the ToroPay demo checkout"
            className="mt-2 aspect-square w-full rounded-lg"
          />
        ) : (
          <div className="mt-2 flex aspect-square w-full items-center justify-center rounded-lg bg-cornsilk-600 text-xs text-olive-leaf">
            Generating QR…
          </div>
        )}
        <p className="mt-2 text-center text-xs font-medium text-olive-leaf">Demo checkout · no payment taken</p>
      </a>
    )
  }

  if (active === 'checkout') {
    return (
      <div className="relative w-full max-w-[14rem] -rotate-2 rounded-[1.5rem] border border-black-forest/15 bg-cornsilk-800 p-2.5 shadow-2xl">
        <div className="rounded-[1.1rem] bg-black-forest p-3.5 text-cornsilk">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Demo Store</span>
            <span className="rounded-full bg-cornsilk/15 px-2 py-0.5 text-xs font-semibold">UPI</span>
          </div>
          <p className="mt-4 text-xs text-cornsilk">Amount to pay</p>
          <p className="mt-1 text-2xl font-bold">₹1,299</p>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-cornsilk/10 p-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sunlit-clay text-black-forest">
              <Check className="h-3 w-3" aria-hidden />
            </span>
            <span className="text-xs">Paid directly to your UPI ID</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full max-w-[15rem] rotate-2 rounded-2xl border border-black-forest/15 bg-cornsilk-800 p-3.5 shadow-2xl">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sunlit-clay text-black-forest">
          <Link2 className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-semibold text-black-forest">Payment link</p>
          <p className="text-xs text-olive-leaf">Demo Store</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-olive-leaf">Amount</p>
      <p className="text-xl font-bold text-black-forest">₹1,299</p>
      <Link
        href={DEMO_PATH}
        className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-cornsilk-600 px-2.5 py-1.5 text-xs text-olive-leaf hover:text-black-forest"
      >
        <span className="truncate">toropay.co.in/pay/demo-store</span>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-copperwood" aria-hidden />
      </Link>
    </div>
  )
}

export function ToolShowcase({ hero, className = '' }: { hero: ReactNode; className?: string }) {
  const [active, setActive] = useState<ToolId>('link')
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const tool = TOOLS.find(item => item.id === active) ?? TOOLS[0]

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(DEMO_URL, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0a0a0a', light: '#ffffff' },
    })
      .then(value => {
        if (!cancelled) setQrSrc(value)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div
      className={`rounded-[2rem] border border-olive-leaf-800 bg-cornsilk-800 p-3 shadow-xl sm:p-4 ${className}`}
    >
      <div className="grid overflow-hidden rounded-[1.5rem] border border-olive-leaf-800/70 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative min-h-[30rem] min-w-0 overflow-hidden bg-blue-hero p-5 sm:min-h-[34rem] sm:p-8">
          <div
            className={`pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full blur-3xl transition-colors duration-500 ${tool.accent}`}
          />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-cornsilk/10 blur-3xl" />
          <div
            className="pointer-events-none absolute -bottom-64 -right-44 h-[34rem] w-[34rem] rounded-full border-[1.75rem] border-sunlit-clay/15"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-48 -right-28 h-[25rem] w-[25rem] rounded-full border border-white/10"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-24 top-24 h-64 w-64 rounded-full border border-white/[0.06]"
            aria-hidden
          />

          <div className="relative flex h-full flex-col">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-cornsilk">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cornsilk/30 bg-cornsilk/10">
                  <Link2 className="h-4 w-4" aria-hidden />
                </span>
                ToroPay
              </span>
              <span className="rounded-full bg-sunlit-clay px-2.5 py-1 text-xs font-medium text-black-forest sm:text-sm">
                Free to use
              </span>
            </div>

            <div className="mt-8 max-w-xl">{hero}</div>

            <div key={tool.id} className="tour-pop relative mt-8 flex flex-1 flex-col items-center justify-end">
              <p className="mb-3 text-sm font-medium text-cornsilk">Preview: {tool.name}</p>
              <ToolVisual active={active} qrSrc={qrSrc} />
            </div>
          </div>
        </div>

        <div className="relative flex min-h-full min-w-0 flex-col overflow-hidden bg-gradient-to-b from-white to-blue-50 p-5 sm:p-8">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full border-[1.25rem] border-sunlit-clay/15"
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-olive-leaf">A quick look</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-black-forest sm:text-3xl">My ToroPay</h2>
            </div>
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunlit-clay text-black-forest"
              aria-hidden
            >
              <Smile className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-olive-leaf">
            Pick a tool to preview it. Every tool is included in the free account.
          </p>

          <div className="mt-6 flex items-center justify-between border-b border-olive-leaf-800 pb-2 text-xs font-medium text-olive-leaf">
            <span>Tool</span>
            <span className="hidden sm:inline">Included</span>
          </div>

          <div className="divide-y divide-olive-leaf-800">
            {TOOLS.map(item => {
              const Icon = item.icon
              const selected = item.id === active
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActive(item.id)}
                  aria-pressed={selected}
                  className="flex w-full items-center gap-3 py-4 text-left"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                      selected ? 'bg-sunlit-clay text-black-forest' : 'bg-cornsilk-700 text-copperwood'
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-semibold ${selected ? 'text-black-forest' : 'text-olive-leaf'}`}>
                      {item.name}
                    </span>
                    <span className="block truncate text-sm text-olive-leaf">{item.detail}</span>
                  </span>
                  <span className="hidden text-sm text-olive-leaf sm:block">Included</span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                      selected ? 'bg-black-forest text-sunlit-clay' : 'bg-cornsilk-700 text-olive-leaf'
                    }`}
                  >
                    {selected ? <Check className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                  </span>
                </button>
              )
            })}
          </div>

          <p className="mt-auto pt-6 text-sm leading-relaxed text-olive-leaf">
            No signup needed to preview. The live demo opens a real checkout with sample data.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-3 pb-1 pt-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="hidden items-center gap-2 text-sm text-olive-leaf sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <Link2 className="h-4 w-4 text-copperwood" aria-hidden /> Create
          </span>
          <span className="h-px w-5 bg-olive-leaf-700" />
          <span className="inline-flex items-center gap-1.5">
            <Share2 className="h-4 w-4 text-copperwood" aria-hidden /> Share
          </span>
          <span className="h-px w-5 bg-olive-leaf-700" />
          <span className="inline-flex items-center gap-1.5">
            <BadgeCheck className="h-4 w-4 text-copperwood" aria-hidden /> Get paid
          </span>
        </div>

        <div className="mx-auto flex items-center gap-1 rounded-full border border-olive-leaf-800 bg-cornsilk-700 p-1.5 shadow-lg sm:mx-0">
          {TOOLS.map(item => {
            const Icon = item.icon
            const selected = item.id === active
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActive(item.id)}
                aria-label={`Preview ${item.name}`}
                aria-pressed={selected}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                  selected ? 'bg-sunlit-clay text-black-forest' : 'text-olive-leaf hover:bg-cornsilk-600'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            )
          })}
          <span className="mx-1 h-6 w-px bg-olive-leaf-800" />
          <Link
            href={DEMO_PATH}
            aria-label="Open the live demo checkout"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black-forest text-cornsilk hover:bg-sunlit-clay hover:text-black-forest"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  )
}
