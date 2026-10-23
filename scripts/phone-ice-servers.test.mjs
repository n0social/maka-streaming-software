import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

if (!process.env.PHONE_ICE_TEST_CHILD) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(import.meta.url)], {
    env: { ...process.env, PHONE_ICE_TEST_CHILD: '1' },
    stdio: 'inherit',
  })
  process.exit(r.status ?? 1)
}

const {
  PHONE_WEBRTC_STUN_URL,
  buildPhoneIceServers,
  isPhoneTurnConfigured,
  phoneUnauthenticatedIceServersJson,
} = await import('../src/shared/phone-ice-servers.ts')

import assert from 'node:assert/strict'

const FAKE_TURN_CREDENTIAL = 'fake-turn-credential-test-value-xyz'

const stunOnly = buildPhoneIceServers({})
assert.equal(stunOnly.length, 1)
assert.equal(stunOnly[0].urls, PHONE_WEBRTC_STUN_URL)
assert.equal(isPhoneTurnConfigured({}), false)
assert.equal(isPhoneTurnConfigured({ turnUrl: '   ' }), false)

const withTurn = buildPhoneIceServers({
  turnUrl: 'turn:relay.example.com:3478',
  turnUsername: 'user',
  turnCredential: FAKE_TURN_CREDENTIAL,
})
assert.equal(withTurn.length, 2)
assert.equal(withTurn[0].urls, PHONE_WEBRTC_STUN_URL)
assert.equal(withTurn[1].urls, 'turn:relay.example.com:3478')
assert.equal(withTurn[1].username, 'user')
assert.equal(withTurn[1].credential, FAKE_TURN_CREDENTIAL)
assert.equal(isPhoneTurnConfigured({ turnUrl: 'turn:relay.example.com:3478' }), true)

const getPageIceJson = phoneUnauthenticatedIceServersJson()
assert.ok(!getPageIceJson.includes(FAKE_TURN_CREDENTIAL))
assert.ok(getPageIceJson.includes(PHONE_WEBRTC_STUN_URL))

const pairResponseJson = JSON.stringify({
  ok: true,
  session: 'test-session-id',
  iceServers: withTurn,
})
assert.ok(pairResponseJson.includes(FAKE_TURN_CREDENTIAL))
assert.ok(!getPageIceJson.includes(FAKE_TURN_CREDENTIAL))

console.log('phone-ice-servers.test.mjs: ok')
