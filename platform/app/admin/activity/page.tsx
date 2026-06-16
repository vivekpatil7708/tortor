'use client'

import { useEffect, useState } from 'react'

interface Log {
  id: string
  email: string
  action: string
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export default function AdminActivity() {
  const [logs, setLogs] = useState<Log[]>([])

  useEffect(() => {
    fetch('/api/admin/activity').then(r => r.json()).then(d => setLogs(d.logs || [])).catch(() => {})
  }, [])

  const actionColor: Record<string, string> = {
    signup: 'bg-green-50 text-green-700',
    login: 'bg-blue-50 text-blue-700',
    logout: 'bg-gray-50 text-gray-700',
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Activity Log ({logs.length})</h1>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-5 py-3 font-semibold text-gray-500">Action</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Email</th>
              <th className="px-5 py-3 font-semibold text-gray-500">IP Address</th>
              <th className="px-5 py-3 font-semibold text-gray-500">User Agent</th>
              <th className="px-5 py-3 font-semibold text-gray-500">Time</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-5 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actionColor[l.action] || 'bg-gray-50 text-gray-700'}`}>
                    {l.action}
                  </span>
                </td>
                <td className="px-5 py-3 font-medium">{l.email}</td>
                <td className="px-5 py-3 font-mono text-xs text-gray-500">{l.ip_address || '—'}</td>
                <td className="max-w-xs truncate px-5 py-3 text-xs text-gray-400" title={l.user_agent || ''}>
                  {l.user_agent ? l.user_agent.split('/')[0] : '—'}
                </td>
                <td className="px-5 py-3 text-gray-400">
                  {new Date(l.created_at).toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No activity recorded yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
