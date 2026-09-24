'use client'

import { EmptyState } from '@/components/ui/empty-state'

export default function WebsitePage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Website Integration</h1>
      <EmptyState
        title="Website plugins & API coming soon"
        description="Phase 1 focuses on manual orders and delivery. Headless commerce widgets and shop plugin plugins will land in a later phase."
      />
    </div>
  )
}