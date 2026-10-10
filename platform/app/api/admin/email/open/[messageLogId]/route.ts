import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messageLogId: string }> }
) {
  try {
    await requireAdmin()
    const { messageLogId } = await params

    // Verify the message log exists
    const messageLog = await prisma.messageLog.findUnique({
      where: { id: messageLogId },
      select: { id: true },
    })

    if (!messageLog) {
      return new NextResponse(TRANSPARENT_PNG, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      })
    }

    // Record the open event (idempotent - we'll let the unique constraint handle duplicates if we add one)
    await prisma.messageOpenEvent.create({
      data: {
        messageLogId,
        ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
      },
    }).catch(() => {})

    return new NextResponse(TRANSPARENT_PNG, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  } catch (err: unknown) {
    // Even on error, return the transparent pixel to not break the email
    return new NextResponse(TRANSPARENT_PNG, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    })
  }
}