/** Shared live-session / relay auto-recovery limits (renderer + main relay manager). */

/** Network blips (WHIP ICE, relay health/restart) may retry up to this cap. */
export const MAX_LIVE_RETRY_ATTEMPTS = 30

export const LIVE_RETRY_BASE_MS = 1_000
export const LIVE_RETRY_MAX_MS = 15_000

/** `attemptIndex` is zero-based (0 = first retry wait). */
export function liveRetryBackoffMs(attemptIndex: number): number {
  const capped = Math.min(Math.max(0, attemptIndex), 4)
  return Math.min(LIVE_RETRY_MAX_MS, LIVE_RETRY_BASE_MS * 2 ** capped)
}

const FATAL_INGEST_PATTERNS: RegExp[] = [
  /\b401\b/,
  /\b403\b/,
  /\bunauthorized\b/,
  /\bforbidden\b/,
  /\binvalid\s+stream\s+key\b/,
  /\bstream\s+key\s+(is\s+)?invalid\b/,
  /\bbad\s+stream\s+key\b/,
  /\bauthentication\s+failed\b/,
  /\bauth(?:entication)?\s+failed\b/,
  /\baccess\s+denied\b/,
  /\bnot\s+authorized\b/,
  /\bpermission\s+denied\b/,
  /\binvalid\s+key\b/,
  /\bkey\s+expired\b/,
  /\bpublish\s+denied\b/,
  /\blogin\s+failed\b/,
  /\b(?:stream|ingest|publish).{0,40}\brejected\b/,
  /\brejected\b.{0,40}\b(?:stream|ingest|publish|connection)\b/,
  /\bcould\s+not\s+authenticate\b/,
  /\bdenied\s+by\s+server\b/,
]

const RTMP_TRANSIENT_PATTERNS: RegExp[] = [
  /\bbroken\s+pipe\b/,
  /\bconnection\s+reset\b/,
  /\bconnection\s+timed\s+out\b/,
  /\btimed\s+out\b/,
  /\bnetwork\s+is\s+unreachable\b/,
  /\bno\s+route\s+to\s+host\b/,
  /\bi\/o\s+error\b/,
  /\bconnection\s+lost\b/,
]

function messageLooksFatalIngest(text: string): boolean {
  const msg = text.toLowerCase()
  return FATAL_INGEST_PATTERNS.some((re) => re.test(msg))
}

function rtmpPayloadLooksTransient(payload: string): boolean {
  const msg = payload.toLowerCase()
  return RTMP_TRANSIENT_PATTERNS.some((re) => re.test(msg))
}

export function isFatalLiveRecoveryReason(reason: string, detail?: string): boolean {
  if (reason.startsWith('whip:')) return false
  if (
    reason === 'relay:restart' ||
    reason === 'relay:error' ||
    reason === 'relay:health' ||
    reason === 'relay:recover' ||
    reason === 'manual-retry'
  ) {
    return false
  }

  const detailText = detail?.trim() ?? ''
  if (detailText && messageLooksFatalIngest(detailText)) return true

  if (reason.startsWith('rtmp:')) {
    const payload = reason.slice('rtmp:'.length)
    if (rtmpPayloadLooksTransient(payload)) return false
    if (messageLooksFatalIngest(payload)) return true
    if (messageLooksFatalIngest(`${payload} ${detailText}`)) return true
    return false
  }

  if (detailText && messageLooksFatalIngest(`${reason} ${detailText}`)) return true
  return false
}

export function liveRecoveryAttemptCap(reason: string, detail?: string): number {
  return isFatalLiveRecoveryReason(reason, detail) ? 1 : MAX_LIVE_RETRY_ATTEMPTS
}

export function liveRecoveryReasonLabel(reason: string): string {
  if (reason.startsWith('rtmp:')) return 'Stream error'
  if (reason === 'relay:restart' || reason === 'relay:error') return 'Relay restarted'
  if (reason === 'whip:no-video') return 'No video'
  if (reason.startsWith('whip:')) return 'Connection lost'
  if (reason === 'relay:health' || reason === 'relay:recover' || reason === 'manual-retry') {
    return 'Connection lost'
  }
  return 'Connection lost'
}
