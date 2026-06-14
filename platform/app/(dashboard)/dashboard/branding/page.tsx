'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export default function BrandingPage() {
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({
    business_name: '', business_logo_url: '', brand_color_primary: '#7bb86c',
    brand_color_secondary: '#2c2c2c', brand_font: 'Inter', button_style: 'rounded', page_theme: 'cream',
  })

  useEffect(() => {
    api.me().then(({ merchant }) => {
      if (!merchant) return
      setForm({
        business_name: (merchant.business_name as string) || '',
        business_logo_url: (merchant.business_logo_url as string) || '',
        brand_color_primary: (merchant.brand_color_primary as string) || '#7bb86c',
        brand_color_secondary: (merchant.brand_color_secondary as string) || '#2c2c2c',
        brand_font: (merchant.brand_font as string) || 'Inter',
        button_style: (merchant.button_style as string) || 'rounded',
        page_theme: (merchant.page_theme as string) || 'cream',
      })
    }).catch(() => {})
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.updateMerchant(form)
      setMsg('Branding saved')
      setTimeout(() => setMsg(''), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Branding</h1>
        <p className="text-sm text-gray-500">Customize how your payment pages look to customers.</p>
      </div>

      {msg && <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-600">{msg}</div>}

      <form onSubmit={handleSave} className="space-y-5">
        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="mb-4 font-bold">Business Details</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Business Name</label>
              <input value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Logo URL</label>
              <input value={form.business_logo_url} onChange={e => setForm({ ...form, business_logo_url: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
          <h2 className="mb-4 font-bold">Colors & Theme</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Primary</label>
              <input type="color" value={form.brand_color_primary} onChange={e => setForm({ ...form, brand_color_primary: e.target.value })}
                className="h-12 w-full cursor-pointer rounded-xl border border-gray-200 bg-white p-1" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Secondary</label>
              <input type="color" value={form.brand_color_secondary} onChange={e => setForm({ ...form, brand_color_secondary: e.target.value })}
                className="h-12 w-full cursor-pointer rounded-xl border border-gray-200 bg-white p-1" />
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <select value={form.page_theme} onChange={e => setForm({ ...form, page_theme: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none">
              <option value="cream">Cream</option>
              <option value="light">White</option>
              <option value="dark">Dark</option>
            </select>
            <select value={form.button_style} onChange={e => setForm({ ...form, button_style: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none">
              <option value="rounded">Rounded buttons</option>
              <option value="pill">Pill buttons</option>
              <option value="square">Square buttons</option>
            </select>
          </div>
        </div>

        <div className="rounded-2xl border p-6" style={{ backgroundColor: form.page_theme === 'dark' ? '#1a1a1a' : '#fdf8f0' }}>
          <p className="mb-3 text-xs font-semibold uppercase opacity-50">Live preview</p>
          <div className="rounded-xl border bg-white/60 p-4 text-center">
            {form.business_logo_url && <img src={form.business_logo_url} className="mx-auto mb-2 h-8" alt="" />}
            <p className="font-bold" style={{ color: form.brand_color_secondary }}>{form.business_name || 'Your Business'}</p>
            <button type="button" className="mt-3 px-6 py-2 text-sm font-bold text-white"
              style={{ backgroundColor: form.brand_color_primary, borderRadius: form.button_style === 'pill' ? '999px' : form.button_style === 'square' ? '8px' : '12px' }}>
              Pay ₹500
            </button>
          </div>
        </div>

        <Button type="submit" disabled={saving} size="lg">{saving ? 'Saving...' : 'Save Branding'}</Button>
      </form>
    </div>
  )
}
