/** Shown when a page's data couldn't load, so a failure never looks like "nothing here". */
export function LoadError({ what, onRetry, className = '' }: { what: string; onRetry: () => void; className?: string }) {
  return (
    <div role="alert" className={`rounded-2xl border border-red-100 bg-red-50/70 p-5 text-center text-sm text-red-700 ${className}`}>
      Couldn&apos;t load {what}. Check your connection and{' '}
      <button type="button" onClick={onRetry} className="font-semibold underline hover:no-underline">try again</button>.
    </div>
  )
}
