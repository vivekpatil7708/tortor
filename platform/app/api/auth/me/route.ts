import { NextResponse } from 'next/server'
import { getSession, merchantToJson } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  return NextResponse.json({ merchant: session ? merchantToJson(session) : null })
}
