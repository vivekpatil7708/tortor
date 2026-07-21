import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { renderTemplate, validateTemplate, SAMPLE_DATA } from '@/lib/messaging'

export async function POST(req: NextRequest) {
  try {
    await requireSession()
    const { template, subject, data } = await req.json()

    if (!template) return NextResponse.json({ error: 'template body is required' }, { status: 400 })

    const fillData = { ...SAMPLE_DATA, ...data }
    const renderedBody = renderTemplate(template, fillData)
    const renderedSubject = subject ? renderTemplate(subject, fillData) : ''
    const validation = validateTemplate(template)
    const subjectValidation = subject ? validateTemplate(subject) : null

    return NextResponse.json({
      rendered_subject: renderedSubject,
      rendered_body: renderedBody,
      validation,
      subject_validation: subjectValidation,
    })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
