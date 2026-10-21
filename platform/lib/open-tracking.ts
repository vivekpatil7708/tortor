// Opens come from a pixel inside the email, so anything that fetches images
// without a person reading the message would be counted as a read.

// Mail clients and link checkers that fetch images on their own.
const MACHINE_USER_AGENTS = [
  'prefetch',
  'bot',
  'spider',
  'crawler',
  'crawling',
  'slurp',
  'headless',
  'phantomjs',
  'puppeteer',
  'playwright',
  'python-requests',
  'python-urllib',
  'axios',
  'curl/',
  'wget',
  'go-http-client',
  'okhttp',
  'facebookexternalhit',
  'slackbot',
  'slack-imgproxy',
  'twitterbot',
  'linkedinbot',
  'discordbot',
  'telegrambot',
  'whatsapp',
  'embedly',
  'quora link preview',
  'googleimageproxy',
  'doubleclick.net',
  'mail.ru_bot',
]

/**
 * Whether the request looks like a person opening the email. A missing user
 * agent is not counted: some privacy tools remove it, and guessing wrong
 * would count a read that never happened.
 */
export function isHumanUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false
  const lower = userAgent.toLowerCase()
  if (!lower.trim()) return false
  return !MACHINE_USER_AGENTS.some(marker => lower.includes(marker))
}

/** The same address opening the same email again within this window is one read. */
export const OPEN_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000

/**
 * Whether an open should be recorded. An open within the window of the last
 * one from the same address is the same read seen twice.
 */
export function isDuplicateOpen(lastOpenedAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!lastOpenedAt) return false
  return now.getTime() - lastOpenedAt.getTime() < OPEN_DEDUPE_WINDOW_MS
}
