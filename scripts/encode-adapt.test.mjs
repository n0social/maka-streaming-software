import assert from 'node:assert/strict'
import {
  congestionLevel,
  emptyEncodeAdaptState,
  observeEncodeAdapt,
  stepDownEncodeProfile,
  ENCODE_ADAPT_BAD_SAMPLES,
  ENCODE_ADAPT_MIN_SAMPLE_MS,
} from '../src/shared/encode-adapt.ts'
import { encodeProfileSpec } from '../src/shared/stream-encode-profiles.ts'

const cloud = encodeProfileSpec('cloud720p30')
assert.equal(cloud.bitrateMbps, 2.5)
assert.equal(cloud.bFrames, 0)
assert.equal(cloud.encoderPreset, 'ultrafast')
assert.equal(cloud.rateControl, 'cbr')

assert.equal(stepDownEncodeProfile('1080p60', 1), '1080p30')
assert.equal(stepDownEncodeProfile('1080p60', 2), '720p60')
assert.equal(stepDownEncodeProfile('720p30', 1), 'cloud720p30')
assert.equal(stepDownEncodeProfile('cloud720p30', 1), null)

assert.equal(congestionLevel({ dropPercent: 0, roundTripMs: 40, measuredMbps: 6, targetMbps: 6 }), 'ok')
assert.equal(congestionLevel({ dropPercent: 3, roundTripMs: 40, measuredMbps: 6, targetMbps: 6 }), 'mild')
assert.equal(congestionLevel({ dropPercent: 9, roundTripMs: 40, measuredMbps: 6, targetMbps: 6 }), 'severe')

const mild = { dropPercent: 3, roundTripMs: 40, measuredMbps: 6, targetMbps: 6 }
let state = emptyEncodeAdaptState()
let now = 10_000
for (let i = 0; i < ENCODE_ADAPT_BAD_SAMPLES - 1; i++) {
  const step = observeEncodeAdapt(state, '1080p60', mild, now, true)
  state = step.state
  assert.equal(step.next, null)
  now += ENCODE_ADAPT_MIN_SAMPLE_MS
}
const down = observeEncodeAdapt(state, '1080p60', mild, now, true)
assert.equal(down.next, '1080p30')

const severe = observeEncodeAdapt(emptyEncodeAdaptState(), '1080p60', {
  dropPercent: 12,
  roundTripMs: 40,
  measuredMbps: 6,
  targetMbps: 6,
}, 50_000, true)
let severeState = severe.state
let severeNow = 50_000
for (let i = 0; i < ENCODE_ADAPT_BAD_SAMPLES - 1; i++) {
  const step = observeEncodeAdapt(severeState, '1080p60', {
    dropPercent: 12,
    roundTripMs: 40,
    measuredMbps: 6,
    targetMbps: 6,
  }, severeNow, true)
  severeState = step.state
  severeNow += ENCODE_ADAPT_MIN_SAMPLE_MS
}
const severeDown = observeEncodeAdapt(severeState, '1080p60', {
  dropPercent: 12,
  roundTripMs: 40,
  measuredMbps: 6,
  targetMbps: 6,
}, severeNow, true)
assert.equal(severeDown.next, '720p60')

const held = observeEncodeAdapt(down.state, '1080p30', mild, now + ENCODE_ADAPT_MIN_SAMPLE_MS, false)
assert.equal(held.next, null)

const coldUnder = { dropPercent: 0, roundTripMs: 20, measuredMbps: 1, targetMbps: 6 }
let cold = emptyEncodeAdaptState()
let coldNow = 80_000
let coldNext = null
for (let i = 0; i < ENCODE_ADAPT_BAD_SAMPLES; i++) {
  const step = observeEncodeAdapt(cold, '1080p60', coldUnder, coldNow, true)
  cold = step.state
  coldNext = step.next
  coldNow += ENCODE_ADAPT_MIN_SAMPLE_MS
}
assert.equal(coldNext, null)
assert.equal(cold.bitrateWarm, false)

assert.equal(cloud.maxBitrateMbps, 2.5)
assert.equal(cloud.keyframeIntervalSec, 2)
assert.equal(encodeProfileSpec('1080p60').bFrames, 2)
assert.equal(encodeProfileSpec('1080p60').rateControl, 'cbr')

console.log('encode-adapt.test.mjs: ok')
