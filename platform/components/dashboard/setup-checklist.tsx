import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SetupStep = {
  title: string
  body: string
  href: string
  cta: string
  done: boolean
}

/**
 * Shown only while something is missing, so an established merchant never sees
 * it. It answers the question a new dashboard otherwise leaves open: what now?
 */
export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const done = steps.filter(step => step.done).length
  if (done === steps.length) return null

  return (
    <section aria-labelledby="setup-heading" className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="setup-heading" className="text-base font-bold">Finish setting up</h2>
          <p className="mt-0.5 text-sm text-gray-500">A few small steps before you share your first link.</p>
        </div>
        <span className="rounded-full bg-sunlit-clay/30 px-3 py-1 text-xs font-semibold text-black-forest">
          {done} of {steps.length} done
        </span>
      </div>

      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={done}
        aria-label="Setup progress"
      >
        <div className="h-full rounded-full bg-sunlit-clay transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>

      <ol className="mt-5 space-y-2">
        {steps.map((step, index) => (
          <li key={step.title} className={cn('rounded-xl border p-3', step.done ? 'border-transparent bg-gray-50/70' : 'border-gray-100 bg-white')}>
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  step.done ? 'bg-sunlit-clay/40 text-black-forest' : 'bg-black-forest text-sunlit-clay'
                )}
                aria-hidden
              >
                {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-semibold', step.done && 'text-gray-600 line-through')}>{step.title}</p>
                {!step.done && <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{step.body}</p>}
              </div>
            </div>
            {!step.done && (
              <Link
                href={step.href}
                className="ml-9 mt-2 inline-flex items-center gap-1 rounded-lg py-1 text-xs font-semibold text-black-forest underline decoration-sunlit-clay decoration-2 underline-offset-4 hover:decoration-black-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sunlit-clay/40"
              >
                {step.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
