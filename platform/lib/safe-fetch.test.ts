import { describe, expect, it } from 'vitest'
import { isBlockedAddress, postWebhook, UnsafeWebhookUrlError } from './safe-fetch'
import { isValidWebhookUrl } from './validate-url'

describe('isBlockedAddress', () => {
  it('blocks private, loopback, link-local and reserved IPv4', () => {
    for (const ip of ['127.0.0.1', '127.0.0.2', '10.1.2.3', '172.16.0.1', '172.20.5.5', '172.31.255.255',
      '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255']) {
      expect(isBlockedAddress(ip), ip).toBe(true)
    }
  })

  it('blocks private and special IPv6, including IPv4 hidden inside IPv6', () => {
    for (const ip of ['::1', '::', 'fe80::1', 'fd00::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:7f00:1',
      '::ffff:169.254.169.254', '64:ff9b::a9fe:a9fe', '2001:db8::1', '[::1]']) {
      expect(isBlockedAddress(ip), ip).toBe(true)
    }
  })

  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) {
      expect(isBlockedAddress(ip), ip).toBe(false)
    }
  })

  it('treats anything that is not an IP as blocked', () => {
    expect(isBlockedAddress('example.com')).toBe(true)
  })
})

describe('postWebhook refuses unsafe URLs before connecting', () => {
  const send = (url: string) => postWebhook(url, { headers: {}, body: '{}' })

  it('requires https', async () => {
    await expect(send('http://example.com/hook')).rejects.toBeInstanceOf(UnsafeWebhookUrlError)
  })

  it('refuses private and loopback IP addresses', async () => {
    for (const url of ['https://127.0.0.1/hook', 'https://10.0.0.5/hook', 'https://172.20.1.1/hook',
      'https://169.254.169.254/latest/meta-data', 'https://[::1]/hook', 'https://[::ffff:127.0.0.1]/hook',
      'https://2130706433/hook', 'https://0x7f.1/hook']) {
      await expect(send(url), url).rejects.toBeInstanceOf(UnsafeWebhookUrlError)
    }
  })

  it('refuses a name that resolves to a private address', async () => {
    await expect(send('https://localhost/hook')).rejects.toBeInstanceOf(UnsafeWebhookUrlError)
  })
})

describe('isValidWebhookUrl (save-time check)', () => {
  it('accepts public https URLs', () => {
    expect(isValidWebhookUrl('https://shop.example.com/webhooks/toropay')).toBe(true)
    expect(isValidWebhookUrl('https://8.8.8.8/hook')).toBe(true)
  })

  it('rejects http, private addresses and private-network names', () => {
    for (const url of ['http://shop.example.com/hook', 'https://127.0.0.2/hook', 'https://172.20.0.1/hook',
      'https://[::1]/hook', 'https://[fd00::1]/hook', 'https://localhost/hook', 'https://localhost./hook',
      'https://intranet/hook', 'https://metadata.google.internal/computeMetadata', 'https://printer.local/',
      'https://2130706433/hook', 'not a url']) {
      expect(isValidWebhookUrl(url), url).toBe(false)
    }
  })
})
