import assert from 'node:assert/strict'
import {
  formatPlatformViewerTitle,
  parseCount,
  parseTwitchGqlViewers,
  sumPlatformViewers,
} from '../src/shared/platform-viewers.ts'

assert.equal(parseCount('128'), 128)
assert.equal(parseCount('nope'), null)
assert.equal(
  parseTwitchGqlViewers('{"data":{"user":{"stream":{"viewersCount":42}}}}'),
  42,
)
assert.equal(parseTwitchGqlViewers('{"data":{"user":{"stream":null}}}'), null)
assert.equal(sumPlatformViewers({ twitch: 10, youtube: 5 }), 15)
assert.equal(sumPlatformViewers({ twitch: null, youtube: null }), null)
assert.match(formatPlatformViewerTitle({ twitch: 10, youtube: null }), /Twitch/)

console.log('platform-viewers.test.mjs: ok')
