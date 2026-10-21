// The states a message goes through, and the order it goes through them in.
export const MESSAGE_STATUSES = ['pending', 'sent', 'delivered', 'read', 'failed'] as const
export type MessageStatus = typeof MESSAGE_STATUSES[number]

const RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

/**
 * The status a message should have now, given the status it was in and what
 * has just happened. A message only moves forward, so a delivery receipt
 * that arrives after the email was opened does not undo the read.
 */
export function nextStatus(current: string, incoming: MessageStatus): MessageStatus {
  if (incoming === 'failed') return 'failed'
  if (current === 'failed') return 'failed'
  const now = RANK[incoming] ?? 0
  const before = RANK[current] ?? 0
  return now > before ? incoming : (current as MessageStatus)
}
