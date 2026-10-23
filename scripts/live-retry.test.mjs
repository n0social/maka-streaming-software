/** Mirrors src/shared/live-retry.ts — run after logic changes. */
const LIVE_RETRY_BASE_MS = 1_000
const LIVE_RETRY_MAX_MS = 15_000
const MAX_LIVE_RETRY_ATTEMPTS = 30
function liveRetryBackoffMs(attemptIndex) {
  const capped = Math.min(Math.max(0, attemptIndex), 4)
  return Math.min(LIVE_RETRY_MAX_MS, LIVE_RETRY_BASE_MS * 2 ** capped)
}
const FATAL_INGEST_PATTERNS = [/\b403\b/, /\binvalid\s+stream\s+key\b/, /\brejected\b/]
const RTMP_TRANSIENT_PATTERNS = [/\bbroken\s+pipe\b/]
function messageLooksFatalIngest(text) {
  const msg = text.toLowerCase()
  return FATAL_INGEST_PATTERNS.some((re) => re.test(msg))
}
function rtmpPayloadLooksTransient(payload) {
  return RTMP_TRANSIENT_PATTERNS.some((re) => re.test(payload.toLowerCase()))
}
function isFatalLiveRecoveryReason(reason, detail) {
  if (reason.startsWith('whip:')) return false
  if (reason.startsWith('relay:')) return false
  const detailText = (detail ?? '').trim()
  if (reason.startsWith('rtmp:')) {
    const payload = reason.slice(5)
    if (rtmpPayloadLooksTransient(payload)) return false
    return messageLooksFatalIngest(payload) || messageLooksFatalIngest(detailText)
  }
  return false
}
function liveRecoveryAttemptCap(reason, detail) {
  return isFatalLiveRecoveryReason(reason, detail) ? 1 : MAX_LIVE_RETRY_ATTEMPTS
}
import assert from 'node:assert/strict'
assert.equal(MAX_LIVE_RETRY_ATTEMPTS, 30)
const fatalReason = 'rtmp:HTTP 403 Forbidden — stream rejected'
assert.equal(liveRecoveryAttemptCap(fatalReason), 1)
let n = 0
while (n < liveRecoveryAttemptCap(fatalReason)) n += 1
assert.equal(n, 1)
const blip = 'whip:disconnected'
for (let i = 0; i < 9; i++) assert.ok(i < liveRecoveryAttemptCap(blip))
console.log('live-retry.test.mjs: ok')
