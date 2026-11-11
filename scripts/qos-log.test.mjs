import assert from 'node:assert/strict'
import { formatQosLog, pushQosEvent } from '../src/shared/qos-log.ts'

const first = pushQosEvent([], {
  at: '2026-11-11T23:00:01.000Z',
  kind: 'recovery',
  reason: 'whip:disconnected',
  label: 'WHIP disconnected',
  attempt: 1,
  ingest: 'primary',
})
const second = pushQosEvent(first, {
  at: '2026-11-11T23:00:04.000Z',
  kind: 'failover',
  reason: 'rtmp:connection reset',
  label: 'Ingest error',
  detail: 'Switched to backup ingest',
  ingest: 'backup',
})
assert.equal(second.length, 2)
const text = formatQosLog(second)
assert.match(text, /recovery  WHIP disconnected/)
assert.match(text, /failover  Ingest error/)
assert.match(text, /ingest backup/)
assert.equal(formatQosLog([]), 'No connection events this session.')

const capped = [0, 1, 2].map((i) => ({
  at: `2026-11-11T23:00:0${i}.000Z`,
  kind: 'recovery',
  reason: 'relay:health',
  label: 'Relay health lost',
}))
assert.equal(pushQosEvent(capped.slice(0, 2), capped[2], 2).length, 2)

console.log('qos-log.test.mjs: ok')
