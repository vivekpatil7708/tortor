import { notFound } from 'next/navigation'
import { getCheckoutView } from '@/lib/checkout'
import CheckoutFlow from './checkout-flow'

export const dynamic = 'force-dynamic'

export default async function CheckoutPage(props: { params: Promise<{ session: string }> }) {
  const params = await props.params;
  const view = await getCheckoutView(params.session)
  if (!view) notFound()
  return <CheckoutFlow view={view} />
}