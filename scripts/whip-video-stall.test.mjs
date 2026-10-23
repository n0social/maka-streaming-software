/** Mirrors src/renderer/whip.ts stall helpers — run after logic changes. */
const WHIP_VIDEO_WATCHDOG_STALL_MS = 8_000

function evaluateWhipVideoStall(state, bytesSent, nowMs, stallWindowMs) {
  if (state.lastBytes === null) {
    return { next: { lastBytes: bytesSent, stallSinceMs: nowMs }, stalled: false }
  }
  if (bytesSent > state.lastBytes) {
    return { next: { lastBytes: bytesSent, stallSinceMs: null }, stalled: false }
  }
  const stallSince = state.stallSinceMs ?? nowMs
  const next = { lastBytes: bytesSent, stallSinceMs: stallSince }
  return { next, stalled: nowMs - stallSince >= stallWindowMs }
}

import assert from 'node:assert/strict'

let state = { lastBytes: null, stallSinceMs: null }
let r = evaluateWhipVideoStall(state, 1000, 0, WHIP_VIDEO_WATCHDOG_STALL_MS)
assert.equal(r.stalled, false)
state = r.next

r = evaluateWhipVideoStall(state, 5000, 2000, WHIP_VIDEO_WATCHDOG_STALL_MS)
assert.equal(r.stalled, false)
state = r.next

r = evaluateWhipVideoStall(state, 5000, 4000, WHIP_VIDEO_WATCHDOG_STALL_MS)
assert.equal(r.stalled, false)
state = r.next

r = evaluateWhipVideoStall(state, 5000, 11_999, WHIP_VIDEO_WATCHDOG_STALL_MS)
assert.equal(r.stalled, false)
state = r.next

r = evaluateWhipVideoStall(state, 5000, 12_000, WHIP_VIDEO_WATCHDOG_STALL_MS)
assert.equal(r.stalled, true)

state = { lastBytes: 100, stallSinceMs: 0 }
r = evaluateWhipVideoStall(state, 200, 5000, WHIP_VIDEO_WATCHDOG_STALL_MS)
assert.equal(r.stalled, false)
assert.equal(r.next.stallSinceMs, null)

console.log('whip-video-stall.test.mjs: ok')
