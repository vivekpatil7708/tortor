/**
 * What a Resend webhook event means for a message. Kept apart from the route
 * so the mapping can be checked without a server or a database.
 */
export type ResendEventAction =
  | { kind: 'delivered' }
  | { kind: 'opened' }
  | { kind: 'bounced'; reason: string; hard: boolean }
  | { kind: 'complained'; reason: string }
  | { kind: 'failed'; reason: string }
  | { kind: 'ignored' }

/** The parts of a Resend webhook event this module reads. */
export interface ResendEventLike {
  type: string
  data?: {
    email_id?: string
    to?: string[]
    bounce?: { message?: string; type?: string; subType?: string }
    failed?: { reason?: string }
    suppressed?: { message?: string; type?: string }
  }
}

/**
 * What to do about a Resend event. Events that only say a message was sent,
 * or that it was clicked, do not change the state of the message.
 */
export function resendEventAction(event: ResendEventLike): ResendEventAction {
  switch (event.type) {
    case 'email.delivered':
      return { kind: 'delivered' }
    case 'email.opened':
      return { kind: 'opened' }
    case 'email.bounced':
      return {
        kind: 'bounced',
        reason: event.data?.bounce?.message || 'The address bounced',
        // A soft bounce is a temporary problem, so the address stays usable.
        hard: (event.data?.bounce?.type || '').toLowerCase() !== 'soft',
      }
    case 'email.complained':
      return { kind: 'complained', reason: 'The recipient marked the message as spam' }
    case 'email.failed':
      return { kind: 'failed', reason: event.data?.failed?.reason || 'The message could not be sent' }
    default:
      return { kind: 'ignored' }
  }
}

/** The address an event is about, lower-cased so it can be compared. */
export function eventEmail(event: ResendEventLike): string | null {
  const to = event.data?.to?.[0]
  return to ? to.trim().toLowerCase() : null
}

/** The provider's id for the message an event is about. */
export function eventMessageId(event: ResendEventLike): string | null {
  return event.data?.email_id || null
}

/** Why an address is put on the suppression list. */
export function suppressionReason(action: ResendEventAction): string | null {
  if (action.kind === 'bounced' && action.hard) return 'bounced'
  if (action.kind === 'complained') return 'complained'
  return null
}
