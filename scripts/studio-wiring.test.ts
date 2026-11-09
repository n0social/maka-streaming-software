import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nextCustomSceneId, removeCustomScene } from '../src/shared/custom-scenes.ts'
import { alertBoxPageUrl, alertCard, parseTwitchIrcAlert, streamChatUrl } from '../src/shared/stream-overlays.ts'
import {
  dropPercentLabel,
  frameIntervalMs,
  intermissionEndsAt,
  intermissionSubtitle,
  isIntermissionMinutes,
  mbpsFromByteDelta,
  measuredFps,
  viewerStatusLabel,
} from '../src/shared/studio-controls.ts'

const existing = [
  { id: 'custom-1', name: 'Intro' },
  { id: 'custom-2', name: 'BRB' },
]
assert.deepEqual(
  removeCustomScene(existing, 'custom-2').map((scene) => scene.id),
  ['custom-1'],
)
assert.equal(removeCustomScene(existing, 'gaming-cam').length, 2)
assert.equal(nextCustomSceneId(removeCustomScene(existing, 'custom-1')), 'custom-1')

const start = 1_000_000
const ends = intermissionEndsAt(start, 5)
assert.equal(ends - start, 5 * 60_000)
assert.equal(intermissionSubtitle(start, null, 'Short break'), 'Short break')
assert.equal(intermissionSubtitle(start + 1000, ends, 'Short break'), 'Back in 4:59')
assert.equal(intermissionSubtitle(ends, ends, 'Short break'), 'Intermission over')
assert.equal(isIntermissionMinutes(15), true)
assert.equal(isIntermissionMinutes(10), false)

assert.equal(measuredFps(30, 1000), 30)
assert.equal(measuredFps(1, 100), null)
assert.equal(frameIntervalMs(30), 33)
assert.equal(dropPercentLabel(3, 100), '3.0')
assert.equal(mbpsFromByteDelta(125_000, 1000), 1)

assert.equal(viewerStatusLabel(false, null).text, 'Offline')
assert.equal(viewerStatusLabel(true, null).text, 'Viewers: local')
assert.equal(viewerStatusLabel(true, 12).text, 'Viewers: 12')

const appTs = readFileSync(new URL('../src/renderer/app.ts', import.meta.url), 'utf8')
assert.equal(appTs.includes("console.log('Checking panel:'"), false)
assert.equal(appTs.includes("panel.addonId === 'com.tabcast.discord-now-live'"), false)
assert.match(appTs, /openGoLiveFlow\(\)/)
assert.equal(appTs.includes('Twitch (add key)'), false)
assert.equal(appTs.includes('pushStudioNotice'), false)

const cheer = parseTwitchIrcAlert(
  '@display-name=Ada;bits=500;id=abc :ada!ada@ada.tmi.twitch.tv PRIVMSG #maka :cheer500 hello',
)
assert.equal(cheer?.kind, 'cheer')
assert.equal(alertCard(cheer!).headline, 'Ada cheered 500 bits')
assert.equal(streamChatUrl('twitch', 'MakaLive'), 'https://www.twitch.tv/popout/makalive/chat?popout=')
assert.equal(streamChatUrl('youtube', 'dQw4w9WgXcQ'), 'https://www.youtube.com/live_chat?is_popout=1&v=dQw4w9WgXcQ')
assert.equal(alertBoxPageUrl('http://streamlabs.example/box'), null)
assert.equal(alertBoxPageUrl('https://streamlabs.com/alert-box/live/example'), 'https://streamlabs.com/alert-box/live/example')

console.log('studio-wiring tests passed')
