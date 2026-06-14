import { NextRequest, NextResponse } from 'next/server'
import { hashPassword, requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateApiKey } from '@/lib/utils'

export async function GET() {
  try {
    const session = await requireSession()
    const keys = await prisma.apiKey.findMany({
      where: { merchantId: session.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
      },
    })
    return NextResponse.json(keys.map(k => ({
      id: k.id,
      name: k.name,
      key_prefix: k.keyPrefix,
      scopes: JSON.parse(k.scopes),
      expires_at: k.expiresAt?.toISOString() ?? null,
      last_used_at: k.lastUsedAt?.toISOString() ?? null,
      created_at: k.createdAt.toISOString(),
    })))
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession()
    if (session.plan === 'free') {
      return NextResponse.json({ error: 'API keys require Pro or Growth plan' }, { status: 403 })
    }

    const { name } = await req.json()
    const rawKey = generateApiKey()
    const keyHash = await hashPassword(rawKey)
    const keyPrefix = rawKey.slice(0, 12)

    await prisma.apiKey.create({
      data: {
        merchantId: session.id,
        name: name || 'Default',
        keyHash,
        keyPrefix,
        scopes: JSON.stringify(['read', 'write']),
      },
    })

    return NextResponse.json({ key: rawKey, prefix: keyPrefix })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
