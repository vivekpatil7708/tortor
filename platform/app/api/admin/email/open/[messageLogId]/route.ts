import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isDuplicateOpen, isHumanUserAgent } from '@/lib/open-tracking'
import { nextStatus } from '@/lib/message-status'

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** The pixel. It is always the same, whether the open was recorded or not. */
function pixel() {
  return new NextResponse(TRANSPARENT_PNG, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messageLogId: string }> }
) {
  try {
    const { messageLogId } = await params

    const messageLog = await prisma.messageLog.findUnique({
      where: { id: messageLogId },
      select: { id: true, readAt: true, status: true },
    })

    // A pixel for a message that does not exist is still a pixel: the email
    // must not show a broken image.
    if (!messageLog) return pixel()

    // Mail clients fetch images on their own, so only a request that looks
    // like a person is counted as a read.
    const userAgent = req.headers.get('user-agent')
    if (!isHumanUserAgent(userAgent)) return pixel()

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'

    // The same address opening the same email again is the same read.
    const lastOpen = await prisma.messageOpenEvent.findFirst({
      where: { messageLogId, ipAddress },
      orderBy: { openedAt: 'desc' },
      select: { openedAt: true },
    })
    if (isDuplicateOpen(lastOpen?.openedAt)) return pixel()

    await prisma.messageOpenEvent.create({
      data: { messageLogId, ipAddress, userAgent: userAgent ?? 'unknown' },
    })

    // The first open is when the message was read.
    if (!messageLog.readAt) {
      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: {
          readAt: new Date(),
          status: nextStatus(messageLog.status, 'read'),
        },
      })
    }

    return pixel()
  } catch (err: unknown) {
    // A failure here must not break the email, but it should not be silent.
    console.error('Could not record the open:', err)
    return pixel()
  }
}
