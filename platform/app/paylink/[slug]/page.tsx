import { notFound } from 'next/navigation'
import { getPaylinkView } from '@/lib/payment-link'
import PaylinkClient from './paylink-client'

export const dynamic = 'force-dynamic'

export default async function PaylinkPage({ params }: { params: { slug: string } }) {
  const view = await getPaylinkView(params.slug)
  if (!view) notFound()
  return <PaylinkClient view={view} slug={params.slug} />
}