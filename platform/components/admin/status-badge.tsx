import { Badge, type BadgeTone } from '@/components/ui/badge'

// The states a campaign or a message can be in, and how each is shown.
const CAMPAIGN_TONES: Record<string, BadgeTone> = {
  draft: 'gray',
  sending: 'yellow',
  sent: 'green',
  failed: 'red',
}

const MESSAGE_TONES: Record<string, BadgeTone> = {
  pending: 'yellow',
  queued: 'yellow',
  sent: 'blue',
  delivered: 'green',
  read: 'green',
  failed: 'red',
}

const FEEDBACK_TONES: Record<string, BadgeTone> = {
  new: 'blue',
  reviewed: 'gray',
  actioned: 'green',
}

export function CampaignStatusBadge({ status }: { status: string }) {
  return <Badge tone={CAMPAIGN_TONES[status] ?? 'gray'}>{status}</Badge>
}

export function MessageStatusBadge({ status }: { status: string }) {
  return <Badge tone={MESSAGE_TONES[status] ?? 'gray'}>{status}</Badge>
}

export function FeedbackStatusBadge({ status }: { status: string }) {
  return <Badge tone={FEEDBACK_TONES[status] ?? 'gray'}>{status}</Badge>
}
