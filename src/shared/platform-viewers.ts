/** Parse public viewer-count responses. The relay does not report platform viewers. */

export type PlatformViewerCounts = {
  twitch: number | null
  youtube: number | null
}

export function parseCount(body: string): number | null {
  const text = body.trim()
  if (!/^\d+$/.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function parseTwitchGqlViewers(body: string): number | null {
  try {
    const parsed = JSON.parse(body) as
      | { data?: { user?: { stream?: { viewersCount?: number } | null } | null } }
      | Array<{ data?: { user?: { stream?: { viewersCount?: number } | null } | null } }>
    const root = Array.isArray(parsed) ? parsed[0] : parsed
    const count = root?.data?.user?.stream?.viewersCount
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null
    return Math.floor(count)
  } catch {
    return null
  }
}

export function sumPlatformViewers(counts: PlatformViewerCounts): number | null {
  const parts = [counts.twitch, counts.youtube].filter((value): value is number => value != null)
  if (!parts.length) return null
  return parts.reduce((total, value) => total + value, 0)
}

export function formatPlatformViewerTitle(counts: PlatformViewerCounts): string {
  const bits: string[] = []
  if (counts.twitch != null) bits.push(`Twitch ${counts.twitch.toLocaleString()}`)
  if (counts.youtube != null) bits.push(`YouTube ${counts.youtube.toLocaleString()}`)
  return bits.length ? bits.join(' · ') : 'Waiting for Twitch or YouTube viewer count'
}
