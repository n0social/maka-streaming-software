/** Mirrors src/shared/live-retry.ts — run after logic changes. */
const LIVE_RETRY_BASE_MS = 1_000
const LIVE_RETRY_MAX_MS = 15_000
const MAX_LIVE_RETRY_ATTEMPTS = 30

function liveRetryBackoffMs(attemptIndex) {
  const capped = Math.min(Math.max(0, attemptIndex), 4)
  return Math.min(LIVE_RETRY_MAX_MS, LIVE_RETRY_BASE_MS * 2 ** capped)
}

const FATAL_INGEST_PATTERNS = [
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

const RTMP_TRANSIENT_PATTERNS = [
  /\bbroken\s+pipe\b/,
  /\bconnection\s+reset\b/,
  /\bconnection\s+timed\s+out\b/,
  /\btimed\s+out\b/,
  /\bnetwork\s+is\s+unreachable\b/,
  /\bno\s+route\s+to\s+host\b/,
  /\bi\/o\s+error\b/,
  /\bconnection\s+lost\b/,
]

function messageLooksFatalIngest(text) {
  const msg = text.toLowerCase()
  return FATAL_INGEST_PATTERNS.some((re) => re.test(msg))
}

function rtmpPayloadLooksTransient(payload) {
  const msg = payload.toLowerCase()
  return RTMP_TRANSIENT_PATTERNS.some((re) => re.test(msg))
}

function isFatalLiveRecoveryReason(reason, detail) {
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

  const detailText = (detail ?? '').trim()
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

function liveRecoveryAttemptCap(reason, detail) {
  return isFatalLiveRecoveryReason(reason, detail) ? 1 : MAX_LIVE_RETRY_ATTEMPTS
}

function liveRecoveryReasonLabel(reason) {
  if (reason.startsWith('rtmp:')) return 'Stream error'
  if (reason === 'relay:restart' || reason === 'relay:error') return 'Relay restarted'
  if (reason === 'whip:no-video') return 'No video'
  if (reason.startsWith('whip:')) return 'Connection lost'
  if (reason === 'relay:health' || reason === 'relay:recover' || reason === 'manual-retry') {
    return 'Connection lost'
  }
  return 'Connection lost'
}

import assert from 'node:assert/strict'

assert.equal(liveRetryBackoffMs(0), 1_000)
assert.equal(liveRetryBackoffMs(4), 15_000)
assert.equal(MAX_LIVE_RETRY_ATTEMPTS, 30)

assert.equal(liveRecoveryReasonLabel('whip:failed'), 'Connection lost')
assert.equal(liveRecoveryReasonLabel('whip:no-video'), 'No video')
assert.equal(liveRecoveryReasonLabel('relay:restart'), 'Relay restarted')
assert.equal(liveRecoveryReasonLabel('rtmp:broken pipe'), 'Stream error')

const fatalReason = 'rtmp:Twitch ingest rejected stream (HTTP 403 Forbidden)'
assert.equal(isFatalLiveRecoveryReason(fatalReason), true)
assert.equal(liveRecoveryAttemptCap(fatalReason), 1)

let fatalAttempts = 0
while (fatalAttempts < liveRecoveryAttemptCap(fatalReason)) {
  fatalAttempts += 1
}
assert.equal(fatalAttempts, 1)

const blipReason = 'whip:disconnected'
assert.equal(isFatalLiveRecoveryReason(blipReason), false)
let blipAttempts = 0
while (blipAttempts < 9) {
  assert.ok(blipAttempts < liveRecoveryAttemptCap(blipReason))
  blipAttempts += 1
}

assert.equal(isFatalLiveRecoveryReason('rtmp:broken pipe'), false)

console.log('live-retry.test.mjs: ok')
