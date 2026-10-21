import { describe, expect, it } from 'vitest'
import { campaignInputSchema, firstInputProblem, templateInputSchema, templateProblem } from './campaign-schema'

describe('campaignInputSchema', () => {
  it('accepts a campaign', () => {
    const result = campaignInputSchema.safeParse({
      name: 'October update',
      subject: 'Hello {{merchant_name}}',
      body: 'Here is your payment link: {{payment_link}}',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.audience).toEqual({})
  })

  it('needs a name, a subject and a body', () => {
    const result = campaignInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects a body that is too long', () => {
    const result = campaignInputSchema.safeParse({ name: 'n', subject: 's', body: 'x'.repeat(5001) })
    expect(result.success).toBe(false)
  })

  it('rejects an audience that is not a filter spec', () => {
    const result = campaignInputSchema.safeParse({ name: 'n', subject: 's', body: 'b', audience: { minTransactions: 'many' } })
    expect(result.success).toBe(false)
  })
})

describe('templateInputSchema', () => {
  it('accepts a template and defaults the channel to email', () => {
    const result = templateInputSchema.safeParse({ name: 'Welcome', body: 'Hello' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.channel).toBe('email')
      expect(result.data.subject).toBe('')
    }
  })

  it('rejects a channel that does not exist', () => {
    expect(templateInputSchema.safeParse({ name: 'n', body: 'b', channel: 'sms' }).success).toBe(false)
  })
})

describe('templateProblem', () => {
  it('accepts a template that only uses broadcast variables', () => {
    expect(templateProblem('Hi {{merchant_name}}', 'Pay at {{payment_link}}')).toBeNull()
  })

  it('rejects a variable a broadcast cannot fill in', () => {
    expect(templateProblem('Hi {{customer_name}}', 'Pay at {{payment_link}}'))
      .toBe('These variables are not available here: customer_name')
  })

  it('rejects a variable that does not exist at all', () => {
    expect(templateProblem('Hi {{typo}}', 'body')).toContain('typo')
  })

  it('looks at the subject as well as the body', () => {
    expect(templateProblem('Order {{order_id}}', 'body')).toContain('order_id')
  })
})

describe('firstInputProblem', () => {
  it('names the field that was wrong', () => {
    const result = campaignInputSchema.safeParse({ name: '', subject: 's', body: 'b' })
    expect(result.success).toBe(false)
    if (!result.success) expect(firstInputProblem(result.error)).toContain('name')
  })
})
