import { notFound } from 'next/navigation'
import { getCheckoutView } from '@/lib/checkout'
import SuccessClient from './success-client'

export const dynamic = 'force-dynamic'

export default async function CheckoutSuccessPage(props: { params: Promise<{ session: string }> }) {
  const params = await props.params;
  const view = await getCheckoutView(params.session)
  if (!view) notFound()
  return <SuccessClient view={view} />
}