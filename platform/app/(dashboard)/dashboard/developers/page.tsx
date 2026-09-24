'use client'

import { EmptyState } from '@/components/ui/empty-state'

export default function DevelopersPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">Developers</h1>
      <EmptyState
        title="API keys & webhooks coming soon"
        description="In a later phase you'll get API keys, webhooks for order/fulfillment events, and the public tracking widget snippet."
      />
    </div>
  )
}