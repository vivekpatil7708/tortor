import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { buildMessageContext } from '@/lib/messaging/events'
import { sendMessage } from '@/lib/messaging/engine'

export type SegmentField =
  | 'total_orders'
  | 'total_spent'
  | 'last_order_at'
  | 'created_after'
  | 'created_before'
  | 'marketing_consent'
  | 'opted_out_channel'

export type SegmentOperator = 'gte' | 'lte' | 'gt' | 'lt' | 'eq' | 'neq' | 'in' | 'not_in'

export interface SegmentRule {
  field: SegmentField
  operator: SegmentOperator
  value: string | number | boolean
}

export interface SegmentPreset {
  id: string
  name: string
  match: 'all' | 'any'
  rules: SegmentRule[]
}

export interface SegmentEvaluation {
  preset: SegmentPreset
  total: number
  customerIds: string[]
  preview: Array<{ id: string; email: string | null; name: string | null; totalSpent: number; totalOrders: number }>
}

function parseNumber(raw: string | number | boolean): number {
  const n = Number(raw)
  if (Number.isNaN(n)) throw new Error(`Expected a number, got "${raw}"`)
  return n
}

function ruleToWhere(rule: SegmentRule): Prisma.CustomerWhereInput {
  const { field, operator, value } = rule
  switch (field) {
    case 'total_orders':
      return { totalOrders: { [operator]: parseNumber(value) } as Prisma.IntFilter }
    case 'total_spent':
      return { totalSpent: { [operator]: parseNumber(value) } as Prisma.IntFilter }
    case 'last_order_at':
    case 'created_before':
    case 'created_after': {
      if (operator !== 'gte' && operator !== 'lte' && operator !== 'gt' && operator !== 'lt') {
        throw new Error(`Dates only support comparison operators, got "${operator}"`)
      }
      const date = new Date(String(value))
      if (Number.isNaN(date.getTime())) throw new Error(`Invalid date "${value}"`)
      const target = field === 'last_order_at' ? 'lastOrderAt' : 'createdAt'
      return { [target]: { [operator]: date } } as Prisma.CustomerWhereInput
    }
    case 'marketing_consent':
      if (operator !== 'eq' && operator !== 'neq') throw new Error('marketing_consent only supports eq/neq')
      return { marketingConsent: operator === 'eq' ? Boolean(value) : !Boolean(value) }
    case 'opted_out_channel': {
      const channel = String(value).toLowerCase()
      if (!/^[a-z_]+$/.test(channel)) throw new Error(`Invalid channel "${value}"`)
      if (operator === 'eq') return { optedOutChannels: { array_contains: [channel] } }
      if (operator === 'not_in') return { optedOutChannels: { not: { array_contains: [channel] } } }
      throw new Error('opted_out_channel only supports eq/not_in')
    }
    default:
      throw new Error(`Unsupported segment field "${String(field)}"`)
  }
}

function ruleWhereClause(rule: SegmentRule): Prisma.CustomerWhereInput {
  try {
    return ruleToWhere(rule)
  } catch {
    return {}
  }
}

export function buildCustomerWhere(rules: SegmentRule[], match: 'all' | 'any'): Prisma.CustomerWhereInput {
  const conditions = rules.map(ruleWhereClause).filter(c => Object.keys(c).length > 0)
  if (conditions.length === 0) return {}
  if (match === 'all') return { AND: conditions }
  return { OR: conditions }
}

export async function listSegmentPresets(merchantId: string): Promise<SegmentPreset[]> {
  const settings = await prisma.merchantSettings.findUnique({ where: { merchantId } })
  const raw = (settings?.savedSegments ?? []) as unknown
  return Array.isArray(raw) ? (raw as SegmentPreset[]) : []
}

export async function saveSegmentPreset(merchantId: string, preset: SegmentPreset): Promise<SegmentPreset[]> {
  if (!preset.id) throw new Error('Segment id is required')
  if (!String(preset.name ?? '').trim()) throw new Error('Segment name is required')
  const current = await listSegmentPresets(merchantId)
  const index = current.findIndex(p => p.id === preset.id)
  const next = [...current]
  const normalized: SegmentPreset = {
    id: preset.id,
    name: String(preset.name).trim(),
    match: preset.match === 'any' ? 'any' : 'all',
    rules: (preset.rules ?? []).slice(0, 50),
  }
  if (index >= 0) next[index] = normalized
  else next.push(normalized)
  await prisma.merchantSettings.upsert({
    where: { merchantId },
    update: { savedSegments: next as unknown as Prisma.InputJsonValue },
    create: { merchantId, savedSegments: next as unknown as Prisma.InputJsonValue },
  })
  return next
}

export async function deleteSegmentPreset(merchantId: string, presetId: string): Promise<SegmentPreset[]> {
  const next = (await listSegmentPresets(merchantId)).filter(p => p.id !== presetId)
  await prisma.merchantSettings.upsert({
    where: { merchantId },
    update: { savedSegments: next as unknown as Prisma.InputJsonValue },
    create: { merchantId, savedSegments: next as unknown as Prisma.InputJsonValue },
  })
  return next
}

/** Evaluate a segment definition against customers of one merchant. */
export async function evaluateSegment(merchantId: string, preset: SegmentPreset): Promise<SegmentEvaluation> {
  const where = buildCustomerWhere(preset.rules, preset.match)
  const customers = await prisma.customer.findMany({
    where: { merchantId, ...where },
    orderBy: { totalSpent: 'desc' },
    select: { id: true, email: true, fullName: true, totalSpent: true, totalOrders: true },
  })
  return {
    preset,
    total: customers.length,
    customerIds: customers.map(c => c.id),
    preview: customers.slice(0, 20).map(c => ({
      id: c.id,
      email: c.email,
      name: c.fullName,
      totalSpent: c.totalSpent,
      totalOrders: c.totalOrders,
    })),
  }
}

export interface SegmentMessageResult {
  total: number
  sent: number
  skipped: number
  failed: number
}

/**
 * Orchestrated "message your segment" run. Promotional by nature: respects
 * marketing consent unless the merchant explicitly opts to include opted-out
 * customers (which also sends to everyone in the segment).
 */
export async function messageSegment(params: {
  merchantId: string
  preset: SegmentPreset
  channel: 'whatsapp' | 'instagram' | 'email'
  includeOptedOut?: boolean
}) {
  const { merchantId, preset, channel, includeOptedOut = false } = params
  const evaluation = await evaluateSegment(merchantId, preset)
  const result: SegmentMessageResult = { total: evaluation.total, sent: 0, skipped: 0, failed: 0 }

  for (const id of evaluation.customerIds) {
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { fullName: true, email: true, marketingConsent: true, optedOutChannels: true },
    })
    if (!customer) continue
    const optedOut = Array.isArray(customer.optedOutChannels) && customer.optedOutChannels.includes(channel)
    const allowed = includeOptedOut || (customer.marketingConsent && !optedOut)
    if (!allowed) {
      result.skipped += 1
      continue
    }

    const context = buildMessageContext({
      customer_name: customer.fullName ?? 'Customer',
      business_name: 'your store',
      order_number: '-',
      order_id: '-',
      product_list: '-',
      amount: '-',
    })

    // Message as an ad-hoc admin-sent message (transactional, template exists for all channels).
    const outcome = await sendMessage({
      merchantId,
      channel,
      eventType: 'manual_message',
      to: channel === 'email' ? (customer.email ?? '') : '',
      customerId: id,
      context,
      idempotencyKey: `manual_segment_${preset.id}_${id}`,
    })
    if (outcome.status === 'failed') {
      result.failed += 1
    } else if (outcome.status !== 'duplicate') {
      result.sent += 1
    } else {
      result.skipped += 1
    }
  }

  return result
}