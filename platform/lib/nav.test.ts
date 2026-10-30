import { describe, expect, it } from 'vitest'
import { activeNavHref } from './nav'

const hrefs = [
  '/dashboard',
  '/dashboard/links',
  '/dashboard/links/new',
  '/dashboard/settings',
  '/dashboard/settings/messaging',
  '/dashboard/transactions',
]

describe('activeNavHref', () => {
  it('matches the exact page', () => {
    expect(activeNavHref('/dashboard/transactions', hrefs)).toBe('/dashboard/transactions')
  })

  it('keeps the dashboard exact so nested pages do not light it up', () => {
    expect(activeNavHref('/dashboard/links', hrefs)).toBe('/dashboard/links')
  })

  it('prefers the longest matching address', () => {
    expect(activeNavHref('/dashboard/settings/messaging', hrefs)).toBe('/dashboard/settings/messaging')
    expect(activeNavHref('/dashboard/settings/team', hrefs)).toBe('/dashboard/settings')
  })

  it('matches a nested page under its section', () => {
    expect(activeNavHref('/dashboard/links/abc123', hrefs)).toBe('/dashboard/links')
  })

  it('returns null when nothing matches', () => {
    expect(activeNavHref('/admin', hrefs)).toBeNull()
  })
})
