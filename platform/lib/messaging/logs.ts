import { prisma } from '@/lib/prisma'

export type MessageLogStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed'

export interface CreateLogInput {
  merchantId: string
  orderId?: string | null
  customerId?: string | null
  fulfillmentId?: string | null
  packageId?: string | null
  channel: string
  eventType?: string | null
  recipient: string
  subject?: string
  body: string
  provider: string
  createdBy: string
  idempotencyKey?: string | null
  status?: MessageLogStatus
}

/** The set of statuses that mean "this message is already handled". */
export const DONE_STATUSES: MessageLogStatus[] = ['sent', 'delivered', 'read']

/**
 * Create a message log row. If an idempotency key is supplied and a
 * non-failed row already exists, the row is NOT recreated — returning null so
 * callers can short-circuit (prevents duplicate sends on webhook replays).
 */
export async function logMessageRow(input: CreateLogInput): Promise<{ logId: string; duplicate: boolean }> {
  const status = input.status ?? 'queued'
  if (input.idempotencyKey) {
    const existing = await prisma.messageLog.findFirst({
      where: {
        merchantId: input.merchantId,
        channel: input.channel,
        idempotencyKey: input.idempotencyKey,
        status: { in: DONE_STATUSES },
      },
    })
    if (existing) return { logId: existing.id, duplicate: true }
  }

  const log = await prisma.messageLog.create({
    data: {
      merchantId: input.merchantId,
      orderId: input.orderId ?? null,
      customerId: input.customerId ?? null,
      fulfillmentId: input.fulfillmentId ?? null,
      packageId: input.packageId ?? null,
      channel: input.channel,
      eventType: input.eventType ?? null,
      recipient: input.recipient,
      subject: input.subject ?? '',
      renderedBody: input.body,
      status,
      provider: input.provider,
      idempotencyKey: input.idempotencyKey ?? null,
      createdBy: input.createdBy,
    },
  })
  return { logId: log.id, duplicate: false }
}

export async function markMessageLog(
  logId: string,
  patch: {
    status?: MessageLogStatus
    providerMessageId?: string | null
    failureReason?: string | null
    errorMessage?: string | null
    sentAt?: Date | null
    deliveredAt?: Date | null
    readAt?: Date | null
  },
) {
  const data: Record<string, unknown> = {}
  if (patch.status !== undefined) data.status = patch.status
  if (patch.providerMessageId !== undefined) data.providerMessageId = patch.providerMessageId
  if (patch.failureReason !== undefined) data.failureReason = patch.failureReason
  if (patch.errorMessage !== undefined) data.errorMessage = patch.errorMessage
  if (patch.sentAt !== undefined) data.sentAt = patch.sentAt
  if (patch.deliveredAt !== undefined) data.deliveredAt = patch.deliveredAt
  if (patch.readAt !== undefined) data.readAt = patch.readAt
  if (patch.status === 'sent') data.sentAt = patch.sentAt ?? new Date()
  if (patch.status === 'delivered' || patch.status === 'read') {
    data.deliveredAt = patch.deliveredAt ?? new Date()
  }
  if (patch.status === 'read') data.readAt = patch.readAt ?? new Date()
  if (patch.status === 'failed') {
    data.attemptCount = { increment: 1 }
  }
  return prisma.messageLog.update({ where: { id: logId }, data })
}

export async function getMessageLogs(
  merchantId: string,
  filters: {
    channel?: string | null
    status?: string | null
    eventType?: string | null
    from?: Date | null
    to?: Date | null
    q?: string | null
    limit?: number
    offset?: number
  } = {},
) {
  const limit = Math.min(filters.limit ?? 50, 200)
  const offset = filters.offset ?? 0
  const where: Record<string, unknown> = { merchantId }
  if (filters.channel) where.channel = filters.channel
  if (filters.status) where.status = filters.status
  if (filters.eventType) where.eventType = filters.eventType
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    }
  }
  if (filters.q) {
    where.OR = [{ recipient: { contains: filters.q, mode: 'insensitive' } }, { subject: { contains: filters.q, mode: 'insensitive' } }]
  }

  const [logs, total] = await prisma.$transaction([
    prisma.messageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { customer: { select: { id: true, fullName: true, email: true, phone: true } } },
    }),
    prisma.messageLog.count({ where }),
  ])
  return { logs, total, limit, offset }
}

/** Apply a delivery receipt (provider → our webhook endpoint). */
export async function handleDeliveryReceipt(merchantId: string, channel: string, providerMessageId: string, receipt: { delivered?: boolean; read?: boolean }) {
  const log = await prisma.messageLog.findFirst({
    where: { merchantId, channel, providerMessageId },
  })
  if (!log) return { ok: false, reason: 'No message log matches the provider message id' }
  if (receipt.read) {
    await markMessageLog(log.id, { status: 'read', readAt: new Date() })
  } else if (receipt.delivered && log.status !== 'read') {
    await markMessageLog(log.id, { status: 'delivered', deliveredAt: new Date() })
  }
  return { ok: true, logId: log.id }
}

/** Retry a previously failed message. Returns the fresh start point. */
export async function retryFailedMessage(logId: string, merchantId: string) {
  const log = await prisma.messageLog.findFirst({ where: { id: logId, merchantId } })
  if (!log) return { ok: false, error: 'Message log not found' }
  if (log.status !== 'failed') return { ok: false, error: 'Only failed messages can be retried' }
  await markMessageLog(log.id, { status: 'queued', failureReason: null, errorMessage: null })
  return { ok: true, log }
}