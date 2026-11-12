import assert from 'node:assert/strict'
import {
  gameAudioKind,
  windowHandleFromCaptureSourceId,
} from '../src/shared/game-audio-source.ts'

assert.equal(gameAudioKind(null), 'none')
assert.equal(gameAudioKind('screen:1:0'), 'screen')
assert.equal(gameAudioKind('window:12345:0'), 'window')
assert.equal(gameAudioKind('browser'), 'none')
assert.equal(windowHandleFromCaptureSourceId('window:987654:0'), '987654')
assert.equal(windowHandleFromCaptureSourceId('window:0:0'), null)
assert.equal(windowHandleFromCaptureSourceId('screen:1:0'), null)
assert.equal(windowHandleFromCaptureSourceId('window:abc:0'), null)

console.log('game-audio-source.test.mjs: ok')
