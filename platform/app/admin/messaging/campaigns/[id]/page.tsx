import { AdminCampaignDetail } from './campaign-detail'

export default async function AdminCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AdminCampaignDetail id={id} />
}
