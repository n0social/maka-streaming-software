/** Mirrors src/shared/live-retry.ts — run after logic changes. */
const LIVE_RETRY_BASE_MS = 1_000
const LIVE_RETRY_MAX_MS = 15_000

function liveRetryBackoffMs(attemptIndex) {
  const capped = Math.min(Math.max(0, attemptIndex), 4)
  return Math.min(LIVE_RETRY_MAX_MS, LIVE_RETRY_BASE_MS * 2 ** capped)
}

import assert from 'node:assert/strict'

assert.equal(liveRetryBackoffMs(0), 1_000)
assert.equal(liveRetryBackoffMs(1), 2_000)
assert.equal(liveRetryBackoffMs(4), 15_000)
assert.equal(liveRetryBackoffMs(99), 15_000)

console.log('live-retry.test.mjs: ok')
