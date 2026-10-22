import { describe, expect, it } from 'vitest'
import {
  BROADCAST_VARIABLES,
  DEFAULT_TEMPLATES,
  SAMPLE_DATA,
  SUPPORTED_VARIABLES,
  getUsedVariables,
  renderTemplate,
  resolveTemplate,
  templatesByChannel,
  unsupportedVariables,
  validateTemplate,
} from './messaging'

describe('resolveTemplate', () => {
  it('prefers the merchant\'s saved wording over our default', () => {
    const saved = { whatsapp: { subject: '', body: 'Thanks {{customer_name}}!' } }
    expect(resolveTemplate('whatsapp', saved).body).toBe('Thanks {{customer_name}}!')
  })

  it('falls back to the default when nothing was saved', () => {
    expect(resolveTemplate('whatsapp', {})).toEqual(DEFAULT_TEMPLATES.whatsapp)
    expect(resolveTemplate('whatsapp', null)).toEqual(DEFAULT_TEMPLATES.whatsapp)
    expect(resolveTemplate('whatsapp', undefined)).toEqual(DEFAULT_TEMPLATES.whatsapp)
  })

  it('ignores a saved row that is blank, rather than sending nothing', () => {
    // A half-saved row should not turn a real message into an empty one.
    expect(resolveTemplate('whatsapp', { whatsapp: { subject: '', body: '   ' } }))
      .toEqual(DEFAULT_TEMPLATES.whatsapp)
  })

  it('keeps a saved subject even when the body is blank', () => {
    // An email with a subject still says something, so it is used as-is.
    expect(resolveTemplate('email', { email: { subject: 'Your receipt', body: '' } }).subject)
      .toBe('Your receipt')
  })

  it('falls back to the default for a channel with no template at all', () => {
    expect(resolveTemplate('carrier-pigeon', {})).toEqual({ subject: '', body: '' })
  })

  it('only uses the template for the channel being sent', () => {
    const saved = { email: { subject: 'S', body: 'email body' } }
    expect(resolveTemplate('whatsapp', saved)).toEqual(DEFAULT_TEMPLATES.whatsapp)
  })
})

describe('templatesByChannel', () => {
  it('keys rows by their channel', () => {
    expect(templatesByChannel([
      { channel: 'email', subject: 'S', body: 'B' },
      { channel: 'whatsapp', subject: '', body: 'W' },
    ])).toEqual({
      email: { subject: 'S', body: 'B' },
      whatsapp: { subject: '', body: 'W' },
    })
  })

  it('treats a missing subject or body as an empty string', () => {
    expect(templatesByChannel([{ channel: 'whatsapp', subject: null, body: null }]))
      .toEqual({ whatsapp: { subject: '', body: '' } })
  })

  it('keeps the last row when a channel repeats', () => {
    expect(templatesByChannel([
      { channel: 'whatsapp', subject: '', body: 'old' },
      { channel: 'whatsapp', subject: '', body: 'new' },
    ]).whatsapp.body).toBe('new')
  })

  it('returns nothing for no rows', () => {
    expect(templatesByChannel([])).toEqual({})
  })
})

describe('renderTemplate', () => {
  it('fills in the values it is given', () => {
    expect(renderTemplate('Hi {{merchant_name}}, order {{order_id}}', {
      merchant_name: 'My Store',
      order_id: 'TXN-1',
    })).toBe('Hi My Store, order TXN-1')
  })

  it('fills in every occurrence, not just the first', () => {
    expect(renderTemplate('{{order_id}} {{order_id}} {{order_id}}', { order_id: 'TXN-1' }))
      .toBe('TXN-1 TXN-1 TXN-1')
  })

  it('leaves a variable it has no value for alone', () => {
    expect(renderTemplate('Hi {{customer_name}}', { merchant_name: 'My Store' }))
      .toBe('Hi {{customer_name}}')
  })
})

describe('getUsedVariables', () => {
  it('lists each variable once, in the order it appears', () => {
    expect(getUsedVariables('{{a}} {{b}} {{a}}')).toEqual(['a', 'b'])
  })

  it('finds nothing in text without variables', () => {
    expect(getUsedVariables('nothing here')).toEqual([])
  })
})

describe('BROADCAST_VARIABLES', () => {
  it('only holds the variables a broadcast to a merchant can fill in', () => {
    expect([...BROADCAST_VARIABLES].sort()).toEqual([
      'currency',
      'feedback_form_link',
      'merchant_name',
      'payment_link',
      'support_email',
      'support_phone',
    ])
  })

  it('leaves out the customer, order and product variables a broadcast has no data for', () => {
    for (const variable of ['customer_name', 'order_id', 'product_name', 'order_amount', 'payment_status', 'delivery_eta', 'custom_note']) {
      expect(BROADCAST_VARIABLES as readonly string[]).not.toContain(variable)
      expect(SUPPORTED_VARIABLES as readonly string[]).toContain(variable)
    }
  })
})

describe('unsupportedVariables', () => {
  it('finds the variables that would be sent literally', () => {
    expect(unsupportedVariables('Hi {{customer_name}}', BROADCAST_VARIABLES)).toEqual(['customer_name'])
  })

  it('accepts a template that only uses allowed variables', () => {
    expect(unsupportedVariables('Hi {{merchant_name}}', BROADCAST_VARIABLES)).toEqual([])
  })
})

describe('validateTemplate', () => {
  it('accepts every supported variable by default', () => {
    const template = SUPPORTED_VARIABLES.map(v => `{{${v}}}`).join(' ')
    expect(validateTemplate(template).valid).toBe(true)
  })

  it('rejects a variable that does not exist at all', () => {
    const result = validateTemplate('Hi {{typo_name}}')
    expect(result.valid).toBe(false)
    expect(result.missingVars).toEqual(['typo_name'])
  })

  it('rejects a supported variable that a broadcast cannot fill in', () => {
    const result = validateTemplate('Hi {{customer_name}}', BROADCAST_VARIABLES)
    expect(result.valid).toBe(false)
    expect(result.missingVars).toEqual(['customer_name'])
    expect(result.usedVars).toEqual(['customer_name'])
  })

  it('fills in every sample value it is given', () => {
    const rendered = renderTemplate(
      SUPPORTED_VARIABLES.map(v => `{{${v}}}`).join(' '),
      SAMPLE_DATA as unknown as Record<string, string>
    )
    expect(rendered).not.toContain('{{')
  })
})
