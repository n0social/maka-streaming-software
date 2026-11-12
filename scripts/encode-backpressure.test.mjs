import assert from 'node:assert/strict'
import {
  BACKPRESSURE_CONFIRM_SAMPLES,
  emptyWhipLoadState,
  nextCompositorSkip,
  observeWhipLoad,
  whipLoadSample,
} from '../src/shared/encode-backpressure.ts'

assert.equal(nextCompositorSkip(0, 40, 16), 1)
assert.equal(nextCompositorSkip(1, 5, 16), 0)
assert.equal(nextCompositorSkip(3, 100, 16), 3)

assert.equal(
  whipLoadSample({ dropPercent: 0, captureFps: 60, targetFps: 60, compositorSkip: 0 }),
  'normal',
)
assert.equal(
  whipLoadSample({ dropPercent: 4, captureFps: 60, targetFps: 60, compositorSkip: 0 }),
  'shed-browser',
)
assert.equal(
  whipLoadSample({ dropPercent: 0, captureFps: 30, targetFps: 60, compositorSkip: 0 }),
  'normal',
)
assert.equal(
  whipLoadSample({ dropPercent: 9, captureFps: 20, targetFps: 60, compositorSkip: 0 }),
  'shed-webcam',
)

let state = emptyWhipLoadState()
for (let i = 0; i < BACKPRESSURE_CONFIRM_SAMPLES - 1; i++) {
  state = observeWhipLoad(state, 'shed-browser')
  assert.equal(state.applied, 'normal')
}
state = observeWhipLoad(state, 'shed-browser')
assert.equal(state.applied, 'shed-browser')

console.log('encode-backpressure.test.mjs: ok')
