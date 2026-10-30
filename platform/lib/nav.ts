/**
 * The menu item for the current page: the longest matching address, so
 * Messaging (/dashboard/settings/messaging) doesn't also light up Settings.
 */
export function activeNavHref(pathname: string, hrefs: string[]): string | null {
  const matches = hrefs.filter(href => pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`)))
  return matches.sort((a, b) => b.length - a.length)[0] ?? null
}
