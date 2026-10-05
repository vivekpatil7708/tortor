import dns from 'dns'
import https from 'https'
import net from 'net'

/**
 * Outgoing webhooks to merchant-supplied URLs. Only public https addresses are
 * reached: the IP the request actually connects to is checked (so a domain
 * pointing at a private address is refused), and redirects are never followed.
 */

// Separate lists: a single BlockList also matches IPv4 addresses against
// IPv4-mapped IPv6 rules, which would block every IPv4 address.
const BLOCKED_V4 = new net.BlockList()
const BLOCKED_V6 = new net.BlockList()

const IPV4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved and broadcast
]

const IPV6_RANGES: Array<[string, number]> = [
  ['::', 96], // unspecified, loopback, IPv4-compatible
  ['::ffff:0:0', 96], // IPv4-mapped
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // local NAT64
  ['100::', 64], // discard
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local
  ['ff00::', 8], // multicast
]

for (const [address, prefix] of IPV4_RANGES) BLOCKED_V4.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of IPV6_RANGES) BLOCKED_V6.addSubnet(address, prefix, 'ipv6')

const TIMEOUT_MS = 10_000
const MAX_RESPONSE_CHARS = 2000

/** True for any address a webhook must not reach: private, loopback, link-local or reserved. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '')
  const family = net.isIP(ip)
  if (family === 4) return BLOCKED_V4.check(ip, 'ipv4')
  if (family === 6) return BLOCKED_V6.check(ip, 'ipv6')
  return true
}

/** The URL can never be delivered to, so retrying is pointless. */
export class UnsafeWebhookUrlError extends Error {}

/** DNS lookup that refuses a name if any of its addresses is blocked. */
function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void
) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '')
    if (!addresses.length || addresses.some(a => isBlockedAddress(a.address))) {
      return callback(new UnsafeWebhookUrlError(`${hostname} points to a private or reserved address`), '')
    }
    if (options.all) return callback(null, addresses)
    callback(null, addresses[0].address, addresses[0].family)
  })
}

export interface WebhookResponse {
  status: number
  ok: boolean
  body: string
}

/** POST a webhook body to a merchant URL. Rejects unsafe URLs; a redirect counts as a failed delivery. */
export function postWebhook(rawUrl: string, opts: { headers: Record<string, string>; body: string }): Promise<WebhookResponse> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return Promise.reject(new UnsafeWebhookUrlError('Invalid webhook URL'))
  }
  if (url.protocol !== 'https:') return Promise.reject(new UnsafeWebhookUrlError('Webhook URL must use https'))
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host) && isBlockedAddress(host)) {
    return Promise.reject(new UnsafeWebhookUrlError(`${host} is a private or reserved address`))
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (done: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      done()
    }

    const req = https.request(
      url,
      {
        method: 'POST',
        headers: { 'User-Agent': 'ToroPay-Webhooks/1.0', ...opts.headers, 'Content-Length': Buffer.byteLength(opts.body) },
        lookup: safeLookup,
        agent: false,
      },
      res => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          text += chunk
          if (text.length >= MAX_RESPONSE_CHARS) res.destroy()
        })
        const done = () => {
          const status = res.statusCode ?? 0
          finish(() => resolve({ status, ok: status >= 200 && status < 300, body: text.slice(0, MAX_RESPONSE_CHARS) }))
        }
        res.on('end', done)
        res.on('close', done)
        res.on('error', done)
      }
    )
    const timer = setTimeout(() => req.destroy(new Error(`No response within ${TIMEOUT_MS / 1000} seconds`)), TIMEOUT_MS)
    req.on('error', err => finish(() => reject(err)))
    req.end(opts.body)
  })
}
