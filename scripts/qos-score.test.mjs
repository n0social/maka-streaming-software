import assert from 'node:assert/strict'
import { dropPercentFromCounts, scoreQos } from '../src/shared/qos-score.ts'

assert.equal(dropPercentFromCounts(4, 100), 4)
assert.equal(scoreQos({ rttMs: 40, dropPercent: 0.2, relayError: null }).grade, 'good')
assert.equal(scoreQos({ rttMs: 500, dropPercent: 10, relayError: 'ingest rejected' }).grade, 'poor')
const fair = scoreQos({ rttMs: 200, dropPercent: 0, relayError: null })
assert.equal(fair.score, 85)
assert.equal(fair.grade, 'good')

console.log('qos-score.test.mjs: ok')
