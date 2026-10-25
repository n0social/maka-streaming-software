import assert from 'node:assert/strict'

function parseWhipStreamMetrics(stats) {
  let roundTripMs = null
  for (const report of stats.values()) {
    if (report.type === 'candidate-pair' && report.currentRoundTripTime > 0) {
      roundTripMs = Math.round(report.currentRoundTripTime * 1000)
    }
  }
  return { roundTripMs }
}

assert.equal(
  parseWhipStreamMetrics(
    new Map([['p', { type: 'candidate-pair', currentRoundTripTime: 0.05 }]]),
  ).roundTripMs,
  50,
)
console.log('whip-stats.test.mjs: ok')
