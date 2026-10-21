import { describe, expect, it } from 'vitest'
import { buildRecipientEmail, recipientVariables, trackingPixelUrl } from './broadcast'

const context = {
  appUrl: 'https://www.toropay.co.in',
  supportEmail: 'support@toropay.co.in',
}

const recipient = {
  id: 'm1',
  email: 'owner@mystore.in',
  businessName: 'My Store',
  phone: '+919876543210',
}

describe('recipientVariables', () => {
  it('gives each merchant their own name and payment link', () => {
    const variables = recipientVariables(recipient, context, { paymentLink: 'https://www.toropay.co.in/pay/abc' })
    expect(variables.merchant_name).toBe('My Store')
    expect(variables.payment_link).toBe('https://www.toropay.co.in/pay/abc')
    expect(variables.feedback_form_link).toBe('https://www.toropay.co.in/feedback')
    expect(variables.support_email).toBe('support@toropay.co.in')
    expect(variables.support_phone).toBe('+919876543210')
    expect(variables.currency).toBe('INR')
  })

  it('falls back to the app URL when the merchant has no payment link yet', () => {
    expect(recipientVariables(recipient, context).payment_link).toBe('https://www.toropay.co.in')
  })

  it('falls back to the email when the merchant has no business name', () => {
    expect(recipientVariables({ ...recipient, businessName: '' }, context).merchant_name).toBe('owner@mystore.in')
  })

  it('uses a campaign specific feedback link when there is one', () => {
    const variables = recipientVariables(recipient, context, { feedbackFormLink: 'https://www.toropay.co.in/feedback?campaign=c1' })
    expect(variables.feedback_form_link).toBe('https://www.toropay.co.in/feedback?campaign=c1')
  })
})

describe('buildRecipientEmail', () => {
  const template = {
    subject: 'Hello {{merchant_name}}',
    body: 'Your payment link: {{payment_link}}\nAsk us at {{support_email}}.',
  }

  it('fills the template in once, for the subject, the body and the HTML', () => {
    const email = buildRecipientEmail(recipient, template, context, { paymentLink: 'https://www.toropay.co.in/pay/abc' })
    expect(email.subject).toBe('Hello My Store')
    expect(email.body).toBe('Your payment link: https://www.toropay.co.in/pay/abc\nAsk us at support@toropay.co.in.')
    expect(email.html).toContain('Hello My Store')
    expect(email.html).toContain('https://www.toropay.co.in/pay/abc')
  })

  it('leaves no placeholder behind in the HTML', () => {
    const email = buildRecipientEmail(recipient, template, context)
    expect(email.html).not.toContain('{{')
    expect(email.subject).not.toContain('{{')
    expect(email.body).not.toContain('{{')
  })

  it('puts the tracking pixel in the email when there is one', () => {
    const email = buildRecipientEmail(recipient, template, context, { trackingPixelUrl: 'https://www.toropay.co.in/api/admin/email/open/log1' })
    expect(email.html).toContain('src="https://www.toropay.co.in/api/admin/email/open/log1"')
  })

  it('leaves the tracking pixel out when there is no log row yet', () => {
    const email = buildRecipientEmail(recipient, template, context)
    expect(email.html).not.toContain('/api/admin/email/open/')
  })

  it('uses the label the campaign asked for', () => {
    const email = buildRecipientEmail(recipient, { ...template, ctaLabel: 'Read the update' }, context)
    expect(email.html).toContain('Read the update')
    expect(email.html).not.toContain('Share Your Feedback')
  })

  it('escapes text a merchant typed', () => {
    const email = buildRecipientEmail(
      { ...recipient, businessName: 'A & B <script>' },
      { subject: 'Hi {{merchant_name}}', body: 'Hello {{merchant_name}}' },
      context
    )
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&amp;')
  })
})

describe('trackingPixelUrl', () => {
  it('points at the open route for the message', () => {
    expect(trackingPixelUrl('log1', 'https://www.toropay.co.in')).toBe('https://www.toropay.co.in/api/admin/email/open/log1')
  })
})
