import { describe, expect, it } from 'vitest'
import { buildMessageContext, defaultMessageBody, defaultMessageSubject } from './messaging/events'
import { renderMessageTemplate, sampleMessageContext, validateMessageTemplate } from './messaging/templates'

describe('subscription messages', () => {
  it('includes the payment link and the customer cancellation link', () => {
    const body = defaultMessageBody('whatsapp', 'subscription_payment_due')
    expect(body).toContain('{{payment_link}}')
    expect(body).toContain('{{cancel_link}}')

    const rendered = renderMessageTemplate(body, sampleMessageContext())
    expect(rendered).toContain('https://checkout.toropay.co.in/checkout/cs_sample')
    expect(rendered).toContain('/subscriptions/cancel/sample-token')
    expect(rendered).not.toContain('{{')
  })

  it('uses only supported variables in the renewal reminder', () => {
    const body = defaultMessageBody('email', 'subscription_renewal_reminder')
    expect(validateMessageTemplate(body).valid).toBe(true)
    expect(defaultMessageSubject('email', 'subscription_renewal_reminder')).toContain('{{plan_name}}')
  })

  it('gives every subscription variable a safe default', () => {
    const context = buildMessageContext({})
    expect(context.plan_name).toBe('-')
    expect(context.next_billing_date).toBe('-')
    expect(context.cancel_link).toBe('')
  })
})
