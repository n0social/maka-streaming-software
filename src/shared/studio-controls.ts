/** Minutes offered on the Intermission row menu. */
export const INTERMISSION_TIMER_MINUTES = [5, 15, 30] as const

export type IntermissionMinutes = (typeof INTERMISSION_TIMER_MINUTES)[number]

export function isIntermissionMinutes(value: number): value is IntermissionMinutes {
  return (INTERMISSION_TIMER_MINUTES as readonly number[]).includes(value)
}

export function intermissionEndsAt(nowMs: number, minutes: IntermissionMinutes): number {
  return nowMs + minutes * 60_000
}

export function formatClockSeconds(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Card subtitle while an intermission countdown is running. */
export function intermissionSubtitle(nowMs: number, endsAt: number | null, fallback: string): string {
  if (endsAt == null) return fallback
  const leftMs = endsAt - nowMs
  if (leftMs <= 0) return 'Intermission over'
  return `Back in ${formatClockSeconds(Math.ceil(leftMs / 1000))}`
}

export function measuredFps(frameCount: number, elapsedMs: number): number | null {
  if (elapsedMs < 250 || frameCount < 1) return null
  const fps = (frameCount * 1000) / elapsedMs
  if (!Number.isFinite(fps) || fps <= 0) return null
  return Math.round(fps)
}

export function frameIntervalMs(fps: number | null): number | null {
  if (fps == null || fps <= 0) return null
  return Math.round(1000 / fps)
}

export function dropPercentLabel(dropped: number, total: number | null): string {
  if (total == null || total <= 0) return dropped === 0 ? '0.0' : '—'
  return ((dropped / total) * 100).toFixed(1)
}

/** Megabits per second from a byte counter delta. */
export function mbpsFromByteDelta(byteDelta: number, elapsedMs: number): number | null {
  if (elapsedMs <= 0 || byteDelta <= 0) return null
  const mbps = (byteDelta * 8) / elapsedMs / 1000
  if (!Number.isFinite(mbps) || mbps <= 0) return null
  return Math.round(mbps * 10) / 10
}

export function viewerStatusLabel(
  isLive: boolean,
  count: number | null,
): { text: string; title: string } {
  if (!isLive) {
    return { text: 'Offline', title: 'Viewer count when you go live' }
  }
  if (count != null) {
    return {
      text: `Viewers: ${count.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      title: 'Live viewer count from the relay',
    }
  }
  return {
    text: 'Viewers: local',
    title: 'This session is live on this machine. The relay has not reported a platform viewer count.',
  }
}
