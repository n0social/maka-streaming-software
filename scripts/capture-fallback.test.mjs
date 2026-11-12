import assert from 'node:assert/strict'
import {
  BLACK_FRAME_SAMPLES,
  frameLooksEmpty,
  observeBlackFrames,
  pickGameplayWindowFallback,
} from '../src/shared/capture-fallback.ts'

const black = new Uint8ClampedArray(64 * 4)
assert.equal(frameLooksEmpty(black), true)
const lit = new Uint8ClampedArray(64 * 4)
lit[0] = 255
lit[1] = 255
lit[2] = 255
assert.equal(frameLooksEmpty(lit), false)

let still = 0
let fallback = false
for (let i = 0; i < BLACK_FRAME_SAMPLES - 1; i++) {
  const step = observeBlackFrames(still, true)
  still = step.stillBlack
  fallback = step.fallback
}
assert.equal(fallback, false)
const tripped = observeBlackFrames(still, true)
assert.equal(tripped.fallback, true)
assert.equal(observeBlackFrames(3, false).stillBlack, 0)

const sources = [
  { id: 'screen:0', name: 'Screen 1', type: 'screen' },
  { id: 'window:1', name: 'Maka', type: 'window' },
  { id: 'window:2', name: 'GeForce NOW', type: 'window' },
]
assert.equal(pickGameplayWindowFallback(sources, 'screen:0')?.id, 'window:2')
assert.equal(pickGameplayWindowFallback(sources, 'window:2'), null)

console.log('capture-fallback.test.mjs: ok')
