import { NextResponse } from 'next/server'
import { getDoc, docToMarkdown } from '@/lib/docs-content'

/**
 * Markdown twin of a documentation page, served at /docs/[slug].md by the
 * rewrite in next.config.js. Same source as the HTML page, so the two cannot
 * drift.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const doc = getDoc((await ctx.params).slug)
  if (!doc) {
    return new NextResponse('# Not found\n\nNo documentation page has this slug.\n', {
      status: 404,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    })
  }

  return new NextResponse(docToMarkdown(doc), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}
