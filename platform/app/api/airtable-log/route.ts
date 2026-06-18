import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.AIRTABLE_API_KEY
  const baseId = process.env.AIRTABLE_BASE_ID
  const tableName = process.env.AIRTABLE_TABLE_NAME

  if (!apiKey || !baseId || !tableName) {
    return NextResponse.json({ error: 'Airtable not configured' }, { status: 500 })
  }

  try {
    const { name, phone, people, amount, status } = await req.json()
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${tableName}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{
          fields: { Name: name, Phone: phone, People: String(people), Amount: amount, Status: status, Note: 'Badminton booking' },
        }],
      }),
    })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to log' }, { status: 500 })
  }
}
