import { isBlockedHost } from './tabcast'

export function isAllowedBrowseUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (isBlockedHost(url.hostname)) return false
    return true
  } catch {
    return false
  }
}

export function normalizeBrowseUrl(raw: string): string | null {
  let url = raw.trim()
  if (!url) return null
  if (!/^https?:\/\//i.test(url)) {
    url =
      url.includes('.') && !url.includes(' ')
        ? `https://${url}`
        : `https://www.google.com/search?q=${encodeURIComponent(url)}`
  }
  if (!isAllowedBrowseUrl(url)) return null
  return url
}
