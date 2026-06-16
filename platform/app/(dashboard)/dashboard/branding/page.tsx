'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Upload, X } from 'lucide-react'

export default function BrandingPage() {
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({
    business_name: '', business_logo_url: '', bg_image_url: '',
    brand_color_primary: '#7bb86c', brand_color_secondary: '#2c2c2c',
    brand_font: 'Inter', button_style: 'rounded', page_theme: 'cream',
  })
  const logoInputRef = useRef<HTMLInputElement>(null)
  const bgInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.me().then(({ merchant }) => {
      if (!merchant) return
      setForm({
        business_name: (merchant.business_name as string) || '',
        business_logo_url: (merchant.business_logo_url as string) || '',
        bg_image_url: (merchant.bg_image_url as string) || '',
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

  function handleFileUpload(file: File | undefined, field: 'business_logo_url' | 'bg_image_url') {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setForm(f => ({ ...f, [field]: dataUrl }))
    }
    reader.readAsDataURL(file)
  }

  const primaryColor = form.brand_color_primary || '#7bb86c'
  const secondaryColor = form.brand_color_secondary || '#2c2c2c'
  const btnRadius = form.button_style === 'pill' ? 'rounded-full' : form.button_style === 'square' ? 'rounded-lg' : 'rounded-xl'
  const isDark = form.page_theme === 'dark'
  const previewBg = form.bg_image_url
    ? { backgroundImage: `url(${form.bg_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { backgroundColor: isDark ? '#1a1a1a' : '#fdf8f0' }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Branding</h1>
        <p className="text-sm text-gray-500">Customize how your payment pages look to customers.</p>
      </div>

      {msg && <div className="mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-600">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-5">
        <form onSubmit={handleSave} className="space-y-5 lg:col-span-3">
          <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
            <h2 className="mb-4 font-bold">Brand Identity</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Business Name</label>
                <input value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Brand Logo</label>
                <div
                  onDragOver={e => { e.preventDefault() }}
                  onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files[0], 'business_logo_url') }}
                  onClick={() => logoInputRef.current?.click()}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-white/50 px-4 py-4 text-sm text-gray-400 hover:border-primary-500 hover:text-primary-600 transition">
                  <Upload className="h-5 w-5" />
                  <span>Drop logo here or click to browse</span>
                  <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => handleFileUpload(e.target.files?.[0], 'business_logo_url')} />
                </div>
                {form.business_logo_url && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2">
                    <img src={form.business_logo_url} className="h-8 w-8 rounded-lg object-cover" alt="" />
                    <span className="flex-1 truncate text-xs text-gray-500">Logo uploaded</span>
                    <button type="button" onClick={() => setForm({ ...form, business_logo_url: '' })} className="text-gray-400 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
            <h2 className="mb-4 font-bold">Checkout Styling</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Background Image</label>
                <div
                  onDragOver={e => { e.preventDefault() }}
                  onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files[0], 'bg_image_url') }}
                  onClick={() => bgInputRef.current?.click()}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-white/50 px-4 py-4 text-sm text-gray-400 hover:border-primary-500 hover:text-primary-600 transition">
                  <Upload className="h-5 w-5" />
                  <span>Drop background image here or click to browse</span>
                  <input ref={bgInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => handleFileUpload(e.target.files?.[0], 'bg_image_url')} />
                </div>
                {form.bg_image_url && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2">
                    <div className="h-8 w-8 rounded-lg bg-cover bg-center" style={{ backgroundImage: `url(${form.bg_image_url})` }} />
                    <span className="flex-1 truncate text-xs text-gray-500">Background uploaded</span>
                    <button type="button" onClick={() => setForm({ ...form, bg_image_url: '' })} className="text-gray-400 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Primary Color</label>
                  <input type="color" value={form.brand_color_primary} onChange={e => setForm({ ...form, brand_color_primary: e.target.value })}
                    className="h-12 w-full cursor-pointer rounded-xl border border-gray-200 bg-white p-1" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Secondary (text)</label>
                  <input type="color" value={form.brand_color_secondary} onChange={e => setForm({ ...form, brand_color_secondary: e.target.value })}
                    className="h-12 w-full cursor-pointer rounded-xl border border-gray-200 bg-white p-1" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <select value={form.page_theme} onChange={e => setForm({ ...form, page_theme: e.target.value })}
                  className="rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none">
                  <option value="cream">Cream</option>
                  <option value="light">White</option>
                  <option value="dark">Dark</option>
                </select>
                <select value={form.button_style} onChange={e => setForm({ ...form, button_style: e.target.value })}
                  className="rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none">
                  <option value="rounded">Rounded buttons</option>
                  <option value="pill">Pill buttons</option>
                  <option value="square">Square buttons</option>
                </select>
              </div>
            </div>
          </div>

          <Button type="submit" disabled={saving} size="lg">{saving ? 'Saving...' : 'Save Branding'}</Button>
        </form>

        <div className="lg:col-span-2">
          <div className="sticky top-8 rounded-2xl border border-white/80 bg-white/60 p-6 backdrop-blur-sm">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-400">Checkout Preview</p>

            <div className="mx-auto flex items-center justify-center">
              <div className="relative h-[520px] w-[260px] overflow-hidden rounded-[36px] border-4 border-gray-800 bg-gray-900 shadow-2xl"
                style={previewBg}>
                <div className="absolute inset-0 flex flex-col items-center px-5 pt-12 pb-6"
                  style={{ backgroundColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)' }}>
                  {form.business_logo_url && (
                    <img src={form.business_logo_url} className="mb-3 h-10 w-10 rounded-xl object-cover" alt="" />
                  )}
                  <p className="text-center text-sm font-bold" style={{ color: secondaryColor }}>
                    {form.business_name || 'Your Business'}
                  </p>
                  <div className="mt-auto flex w-full flex-col items-center">
                    <div className="mb-4 text-3xl font-extrabold tracking-tight" style={{ color: secondaryColor }}>
                      ₹500
                    </div>
                    <button type="button" className={`w-full py-3 text-sm font-bold text-white ${btnRadius}`}
                      style={{ backgroundColor: primaryColor }}>
                      Continue to Pay
                    </button>
                  </div>
                  <p className="mt-4 text-[10px] opacity-40">Powered by ToroPay</p>
                </div>
                <div className="absolute left-1/2 top-3 h-1.5 w-16 -translate-x-1/2 rounded-full bg-gray-700" />
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-gray-400">Changes reflect instantly in preview</p>
          </div>
        </div>
      </div>
    </div>
  )
}
