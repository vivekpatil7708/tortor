export type ClosedReason = 'expired' | 'used-up' | 'inactive' | 'busy'

const MESSAGES: Record<ClosedReason, { title: string; note: string }> = {
  expired: { title: 'This payment link has expired', note: 'Please ask the seller for a new link.' },
  'used-up': { title: "This payment link isn't accepting payments", note: 'It has reached its limit. Please contact the seller.' },
  inactive: { title: "This payment link isn't accepting payments", note: 'Please contact the seller.' },
  busy: { title: 'Someone is paying with this link right now', note: 'Please try again in a little while.' },
}

/** Shown instead of "page not found" when a link exists but can't take a payment now. */
export default function LinkClosed({ reason, business }: {
  reason: ClosedReason
  business: { name: string; logoUrl: string | null; supportEmail: string | null; supportPhone: string | null }
}) {
  const { title, note } = MESSAGES[reason]
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream p-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/80 bg-white/60 p-8 text-center backdrop-blur-md">
        {business.logoUrl && <img src={business.logoUrl} className="mx-auto mb-4 h-12 object-contain" alt="" />}
        {business.name && <p className="text-sm font-semibold text-gray-500">{business.name}</p>}
        <h1 className="mt-2 text-xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">{note}</p>
        {(business.supportEmail || business.supportPhone) && (
          <div className="mt-5 space-y-1 text-sm">
            {business.supportEmail && (
              <p><a href={`mailto:${business.supportEmail}`} className="font-semibold text-primary-600 hover:underline">{business.supportEmail}</a></p>
            )}
            {business.supportPhone && (
              <p><a href={`tel:${business.supportPhone.replace(/[^\d+]/g, '')}`} className="font-semibold text-primary-600 hover:underline">{business.supportPhone}</a></p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
