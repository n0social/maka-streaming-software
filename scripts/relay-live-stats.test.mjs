import assert from 'node:assert/strict'
import { liveStatsFromReports } from './relay-live-stats.mjs'

const stats = liveStatsFromReports([
  { type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.042 },
  { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.02 },
  { type: 'inbound-rtp', kind: 'video', packetsLost: 3 },
  { type: 'inbound-rtp', kind: 'audio', packetsLost: 9 },
])
assert.equal(stats.latencyMs, 20)
assert.equal(stats.droppedFrames, 3)

const empty = liveStatsFromReports([])
assert.equal(empty.latencyMs, undefined)
assert.equal(empty.droppedFrames, undefined)

console.log('relay-live-stats.test.mjs: ok')
