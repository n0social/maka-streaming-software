import assert from 'node:assert/strict'
import { emptyCaptureStallState, observeCaptureFrames, CAPTURE_STALL_SAMPLES } from '../src/shared/capture-health.ts'

let state = emptyCaptureStallState()
let step = observeCaptureFrames(state, 0, false)
assert.equal(step.stalled, false)

state = step.state
step = observeCaptureFrames(state, 10, true)
assert.equal(step.stalled, false)
state = step.state
for (let i = 0; i < CAPTURE_STALL_SAMPLES - 1; i++) {
  step = observeCaptureFrames(state, 10, true)
  assert.equal(step.stalled, false)
  state = step.state
}
step = observeCaptureFrames(state, 10, true)
assert.equal(step.stalled, true)

step = observeCaptureFrames(step.state, 11, true)
assert.equal(step.stalled, false)
assert.equal(step.state.stillSamples, 0)

console.log('capture-health.test.mjs: ok')
