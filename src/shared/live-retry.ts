/** Shared live-session / relay auto-recovery limits (renderer + main relay manager). */

export const MAX_LIVE_RETRY_ATTEMPTS = 8

export const LIVE_RETRY_BASE_MS = 1_000
export const LIVE_RETRY_MAX_MS = 15_000

/** `attemptIndex` is zero-based (0 = first retry wait). */
export function liveRetryBackoffMs(attemptIndex: number): number {
  const capped = Math.min(Math.max(0, attemptIndex), 4)
  return Math.min(LIVE_RETRY_MAX_MS, LIVE_RETRY_BASE_MS * 2 ** capped)
}
