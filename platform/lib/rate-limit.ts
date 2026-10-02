import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Attempt limits backed by the audit_logs table: each attempt is an audit row,
 * and an IP is limited once it has `max` rows of an action inside the window.
 * No extra service is needed; volumes are small (logins, reset requests).
 */

/** The client IP as set by Vercel's edge (first x-forwarded-for hop as fallback). */
export function clientIp(req: NextRequest): string | null {
  return req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
}

export async function isRateLimited(
  req: NextRequest,
  action: string,
  max: number,
  windowMinutes: number
): Promise<boolean> {
  const ip = clientIp(req)
  if (!ip) return false
  const since = new Date(Date.now() - windowMinutes * 60 * 1000)
  const count = await prisma.auditLog.count({ where: { action, ipAddress: ip, createdAt: { gte: since } } })
  return count >= max
}

/** Record an attempt. Never throws: a logging failure must not block the request. */
export async function recordAttempt(req: NextRequest, action: string, email: string, merchantId: string | null = null) {
  await prisma.auditLog
    .create({
      data: { action, email, merchantId, ipAddress: clientIp(req), userAgent: req.headers.get('user-agent') },
    })
    .catch(() => {})
}
