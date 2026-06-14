'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export default function TemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Record<string, unknown>[]>([])
  const [name, setName] = useState('')

  function load() {
    api.getTemplates().then(setTemplates).catch(() => {})
  }

  useEffect(() => { load() }, [])

  async function saveFromCurrentLink() {
    const links = await api.getLinks()
    if (!links.length) { alert('Create a payment link first'); return }
    const link = links[0]
    await api.createTemplate({
      name: name || 'My template',
      config: {
        title: link.title,
        description: link.description,
        amount: link.amount,
        amount_flexible: link.amount_flexible,
        min_amount: link.min_amount,
        max_amount: link.max_amount,
        custom_fields: link.custom_fields,
        webhook_url: link.webhook_url,
      },
    })
    setName('')
    load()
  }

  async function useTemplate(t: Record<string, unknown>) {
    const config = t.config as Record<string, unknown>
    sessionStorage.setItem('toropay_template', JSON.stringify(config))
    router.push('/dashboard/links/new?from=template')
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Payment Templates</h1>
        <p className="text-sm text-gray-500">Save reusable link configurations for stores, events, and bookings.</p>
      </div>

      <div className="mb-6 flex gap-3 rounded-2xl border border-white/80 bg-white/60 p-4 backdrop-blur-sm">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Template name"
          className="flex-1 rounded-xl border border-gray-200 bg-white/70 px-4 py-2 text-sm outline-none" />
        <Button onClick={saveFromCurrentLink}>Save from latest link</Button>
      </div>

      <div className="space-y-3">
        {templates.map(t => (
          <div key={t.id as string} className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
            <div>
              <p className="font-bold">{t.name as string}</p>
              <p className="text-xs text-gray-400">{(t.config as Record<string, unknown>)?.title as string}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => useTemplate(t)}>Use template</Button>
              <Button size="sm" variant="ghost" className="text-red-500"
                onClick={() => api.deleteTemplate(t.id as string).then(load)}>Delete</Button>
            </div>
          </div>
        ))}
        {templates.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-400">No templates yet.</p>
        )}
      </div>
    </div>
  )
}
