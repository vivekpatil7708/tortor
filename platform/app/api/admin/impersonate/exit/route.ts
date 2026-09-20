import { NextResponse } from 'next/server'
import { clearImpersonation } from '@/lib/auth'

export async function POST() {
  await clearImpersonation()
  return NextResponse.json({ success: true })
}