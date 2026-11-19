import assert from 'node:assert/strict'
import { publishPlatformMetadata } from '../src/main/platform-metadata.ts'

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const calls = []
const fetchImpl = async (url, init) => {
  calls.push({ url, method: init?.method ?? 'GET', body: init?.body })
  if (url.includes('/helix/users')) return jsonResponse(200, { data: [{ id: '99' }] })
  if (url.includes('/helix/games')) return jsonResponse(200, { data: [{ id: 'game-1' }] })
  if (url.includes('/helix/channels')) return jsonResponse(204, {})
  if (url.includes('broadcastStatus=active')) {
    return jsonResponse(200, { items: [{ id: 'bc1', snippet: { title: 'old' } }] })
  }
  if (url.includes('liveBroadcasts?part=snippet') && init?.method === 'PUT') return jsonResponse(200, {})
  if (url.includes('thumbnails/set')) return jsonResponse(200, {})
  return jsonResponse(500, {})
}

const report = await publishPlatformMetadata(
  {
    title: 'Ranked set',
    description: 'Cloud lobby',
    category: 'VALORANT',
    twitchToken: 'tw',
    twitchClientId: 'cid',
    youtubeToken: 'yt',
    thumbnail: { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' },
  },
  fetchImpl,
)

assert.equal(report.version, '0.1.1')
assert.equal(report.twitch.ok, true)
assert.equal(report.youtube.ok, true)
assert.ok(calls.some((c) => c.url.includes('/helix/channels') && c.method === 'PATCH'))
const twitchBody = JSON.parse(calls.find((c) => c.method === 'PATCH').body)
assert.equal(twitchBody.title, 'Ranked set')
assert.equal(twitchBody.game_id, 'game-1')
const ytBody = JSON.parse(calls.find((c) => c.method === 'PUT').body)
assert.equal(ytBody.snippet.title, 'Ranked set')
assert.equal(ytBody.snippet.description, 'Cloud lobby')

const skipped = await publishPlatformMetadata(
  { title: 'Ranked set', description: '', category: '' },
  fetchImpl,
)
assert.equal(skipped.twitch.ok, false)
assert.equal(skipped.youtube.ok, false)

console.log('platform-metadata.test.mjs: ok')
