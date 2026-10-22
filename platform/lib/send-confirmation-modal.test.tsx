import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// The send sheet doubles as the WhatsApp entry point, so it opens on WhatsApp
// when the order has a number, and refuses the channel when it does not.
const api = vi.hoisted(() => ({
  getChannelStatus: vi.fn(),
  getMessagingTemplates: vi.fn(),
  sendMessage: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ api }))

const channelStatus = { whatsapp: { status: 'available' }, email: { status: 'available' }, instagram: { status: 'coming_soon' } }

import SendConfirmationModal from '@/components/dashboard/send-confirmation-modal'

const txn = (over: Record<string, unknown> = {}) => ({
  txn_id: 'TXN-1', amount: 500, status: 'success', customer_name: 'Arjun Mehta',
  customer_phone: '+919900112233', customer_email: 'arjun@example.com', ...over,
})

const html = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<SendConfirmationModal txn={txn(over)} onClose={() => {}} onSent={() => {}} />)

/** The channel buttons, with their label text. */
const channelButtons = (markup: string) =>
  [...markup.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)]
    .filter(m => /WhatsApp|Instagram|Email/.test(m[1]))
    .map(m => ({ text: m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), disabled: m[0].includes('disabled') }))

describe('SendConfirmationModal on the payment page', () => {
  it('opens on WhatsApp when the order has a phone number', () => {
    const markup = html()

    // The recipient field starts on the number, ready to send.
    expect(markup).toContain('value="+919900112233"')
    // WhatsApp is the selected channel, so the email subject field is absent.
    expect(markup).not.toContain('Subject')
  })

  it('opens on Email when the order has no phone number', () => {
    const markup = html({ customer_phone: null })

    expect(markup).toContain('value="arjun@example.com"')
    expect(markup).toContain('Subject')
  })

  it('offers WhatsApp but marks it unusable when there is no number', () => {
    const whatsapp = channelButtons(html({ customer_phone: null })).find(b => b.text.startsWith('WhatsApp'))!

    expect(whatsapp.disabled).toBe(true)
    expect(whatsapp.text).toContain('No phone')
    // It says which of the two reasons applies, rather than "Soon".
    expect(whatsapp.text).not.toContain('Soon')
  })

  it('leaves WhatsApp selectable when there is a number', () => {
    const whatsapp = channelButtons(html()).find(b => b.text.startsWith('WhatsApp'))!

    expect(whatsapp.disabled).toBe(false)
    expect(whatsapp.text).not.toContain('No phone')
  })

  it('still shows the email address as the recipient for an email send', () => {
    const markup = html({ customer_email: 'arjun@example.com', customer_phone: null })
    expect(markup).toContain('value="arjun@example.com"')
  })
})
