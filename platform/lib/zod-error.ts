function isZodError(err: unknown): err is { issues: Array<{ message: string }> } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'ZodError'
  )
}

export function zodMessage(err: unknown): string | null {
  if (!isZodError(err)) return null
  return err.issues.map(i => i.message).join(', ')
}