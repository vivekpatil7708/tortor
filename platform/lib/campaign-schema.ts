import { z } from 'zod'
import { audienceSchema } from './broadcast-audience'
import { BROADCAST_VARIABLES, unsupportedVariables } from './messaging'

export const MAX_NAME_LENGTH = 120
export const MAX_SUBJECT_LENGTH = 200
export const MAX_BODY_LENGTH = 5000
export const MAX_CTA_LENGTH = 80

/** What an admin fills in to make a campaign. */
export const campaignInputSchema = z.object({
  name: z.string().trim().min(1, 'Give the campaign a name').max(MAX_NAME_LENGTH),
  subject: z.string().trim().min(1, 'The subject line is required').max(MAX_SUBJECT_LENGTH),
  body: z.string().trim().min(1, 'The message body is required').max(MAX_BODY_LENGTH),
  ctaLabel: z.string().trim().max(MAX_CTA_LENGTH).optional(),
  audience: audienceSchema.default({}),
})

export type CampaignInput = z.infer<typeof campaignInputSchema>

/** The channels a message can be sent on. */
export const CHANNELS = ['email', 'whatsapp', 'instagram'] as const
export type Channel = typeof CHANNELS[number]

/** A template in the admin's own library. */
export const templateInputSchema = z.object({
  name: z.string().trim().min(1, 'Give the template a name').max(MAX_NAME_LENGTH),
  channel: z.enum(CHANNELS).default('email'),
  subject: z.string().trim().max(MAX_SUBJECT_LENGTH).default(''),
  body: z.string().trim().min(1, 'The message body is required').max(MAX_BODY_LENGTH),
  languageCode: z.string().trim().min(2).max(10).default('en'),
  eventType: z.string().trim().max(60).optional(),
})

export type TemplateInput = z.infer<typeof templateInputSchema>

/**
 * The problem with a template, or null when it is fine. A broadcast can only
 * fill in some of the variables a merchant's own messages use, so a template
 * that uses any of the others would send the placeholder itself.
 */
export function templateProblem(subject: string, body: string, allowed: readonly string[] = BROADCAST_VARIABLES): string | null {
  const unsupported = unsupportedVariables(`${subject}\n${body}`, allowed)
  if (unsupported.length === 0) return null
  return `These variables are not available here: ${unsupported.join(', ')}`
}

/** The first problem with an input, as a sentence to show the admin. */
export function firstInputProblem(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'That input is not valid'
  const field = issue.path.join('.')
  return field ? `${field}: ${issue.message}` : issue.message
}
