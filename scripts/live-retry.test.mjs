/** Mirrors src/shared/live-retry.ts — run after logic changes. */
const LIVE_RETRY_BASE_MS = 1_000
const LIVE_RETRY_MAX_MS = 15_000
const MAX_LIVE_RETRY_ATTEMPTS = 8

function liveRetryBackoffMs(attemptIndex) {
  const capped = Math.min(Math.max(0, attemptIndex), 4)
  return Math.min(LIVE_RETRY_MAX_MS, LIVE_RETRY_BASE_MS * 2 ** capped)
}

function liveRecoveryReasonLabel(reason) {
  if (reason.startsWith('rtmp:')) return 'Stream error'
  if (reason === 'relay:restart' || reason === 'relay:error') return 'Relay restarted'
  if (reason.startsWith('whip:')) return 'Connection lost'
  if (reason === 'relay:health' || reason === 'relay:recover' || reason === 'manual-retry') {
    return 'Connection lost'
  }
  return 'Connection lost'
}

import assert from 'node:assert/strict'

assert.equal(liveRetryBackoffMs(0), 1_000)
assert.equal(liveRetryBackoffMs(1), 2_000)
assert.equal(liveRetryBackoffMs(4), 15_000)
assert.equal(liveRetryBackoffMs(99), 15_000)

assert.equal(MAX_LIVE_RETRY_ATTEMPTS, 8)

assert.equal(liveRecoveryReasonLabel('whip:failed'), 'Connection lost')
assert.equal(liveRecoveryReasonLabel('relay:restart'), 'Relay restarted')
assert.equal(liveRecoveryReasonLabel('rtmp:broken pipe'), 'Stream error')

let attempt = 0
let waits = []
while (attempt < MAX_LIVE_RETRY_ATTEMPTS) {
  waits.push(liveRetryBackoffMs(attempt))
  attempt += 1
}
assert.equal(waits.length, MAX_LIVE_RETRY_ATTEMPTS)
assert.equal(waits[0], 1_000)
assert.equal(waits[waits.length - 1], 15_000)

console.log('live-retry.test.mjs: ok')
