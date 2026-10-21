import { describe, expect, it } from 'vitest'
import {
  BROADCAST_VARIABLES,
  SAMPLE_DATA,
  SUPPORTED_VARIABLES,
  getUsedVariables,
  renderTemplate,
  unsupportedVariables,
  validateTemplate,
} from './messaging'

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
