/** Pure tests for phone WebRTC ICE server selection. */
import assert from 'node:assert/strict'
import {
  PHONE_WEBRTC_STUN_URL,
  buildPhoneIceServers,
  isPhoneTurnConfigured,
} from '../src/shared/phone-ice-servers.ts'

const stunOnly = buildPhoneIceServers({})
assert.equal(stunOnly.length, 1)
assert.equal(stunOnly[0].urls, PHONE_WEBRTC_STUN_URL)
assert.equal(isPhoneTurnConfigured({}), false)
assert.equal(isPhoneTurnConfigured({ turnUrl: '   ' }), false)

const withTurn = buildPhoneIceServers({
  turnUrl: 'turn:relay.example.com:3478',
  turnUsername: 'user',
  turnCredential: 'secret',
})
assert.equal(withTurn.length, 2)
assert.equal(withTurn[0].urls, PHONE_WEBRTC_STUN_URL)
assert.equal(withTurn[1].urls, 'turn:relay.example.com:3478')
assert.equal(withTurn[1].username, 'user')
assert.equal(withTurn[1].credential, 'secret')
assert.equal(isPhoneTurnConfigured({ turnUrl: 'turn:relay.example.com:3478' }), true)

console.log('phone-ice-servers.test.mjs: ok')
