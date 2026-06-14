'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

export default function UpiPage() {
  const [upis, setUpis] = useState<Record<string, unknown>[]>([])
  const [newVpa, setNewVpa] = useState('')
  const [adding, setAdding] = useState(false)

  function load() {
    api.getUpis().then(setUpis).catch(() => {})
  }

  useEffect(() => { load() }, [])

  async function addUpi() {
    if (!newVpa.includes('@')) { alert('Enter a valid VPA (e.g. name@bank)'); return }
    setAdding(true)
    try {
      await api.addUpi(newVpa)
      setNewVpa('')
      load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed')
    } finally {
      setAdding(false)
    }
  }

  async function verifyUpi(id: string) {
    await api.verifyUpi(id)
    load()
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">UPI IDs</h1>
        <p className="text-sm text-gray-500">Add the UPI IDs you want to receive payments on.</p>
      </div>

      <div className="mb-6 flex gap-3">
        <input value={newVpa} onChange={e => setNewVpa(e.target.value)} placeholder="merchant@paytm"
          className="flex-1 rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-sm outline-none focus:border-primary-500" />
        <Button onClick={addUpi} disabled={adding}>{adding ? 'Adding...' : 'Add UPI ID'}</Button>
      </div>

      <div className="space-y-3">
        {upis.map((u) => (
          <div key={u.id as string} className="flex items-center justify-between rounded-2xl border border-white/80 bg-white/60 p-5 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="font-mono font-bold">{u.vpa as string}</div>
              {Boolean(u.is_primary) && <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-600">Primary</span>}
              {u.verified_at
                ? <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-600">Verified</span>
                : <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-600">Unverified</span>}
            </div>
            <div className="flex gap-2">
              {!u.verified_at && <Button variant="ghost" size="sm" onClick={() => verifyUpi(u.id as string)}>Verify</Button>}
              {!Boolean(u.is_primary) && <Button variant="ghost" size="sm" onClick={() => api.setPrimaryUpi(u.id as string).then(load)}>Make primary</Button>}
              <Button variant="ghost" size="sm" onClick={() => api.deleteUpi(u.id as string).then(load)} className="text-red-500">Remove</Button>
            </div>
          </div>
        ))}
        {upis.length === 0 && (
          <div className="rounded-2xl border border-white/80 bg-white/60 p-12 text-center text-sm text-gray-400 backdrop-blur-sm">
            No UPI IDs added yet.
          </div>
        )}
      </div>
    </div>
  )
}
