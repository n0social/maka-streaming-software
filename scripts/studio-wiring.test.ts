import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nextCustomSceneId, removeCustomScene } from '../src/shared/custom-scenes.ts'
import { alertBoxPageUrl, alertCard, parseTwitchIrcAlert, streamChatUrl } from '../src/shared/stream-overlays.ts'
import { isTwitchStreamKey, sanitizeYouTubeDescription, streamKeyValid, youtubeVideoId } from '../src/shared/stream-wizard.ts'
import { rewriteWhipOfferMsids } from '../src/shared/whip-msid.ts'
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
assert.equal(isTwitchStreamKey('live_abc123def456789'), true)
assert.equal(streamKeyValid('youtube', 'abcd-efgh-ijkl-mnop'), true)
assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
const wizardHtml = readFileSync(new URL('../src/renderer/app.html', import.meta.url), 'utf8')
assert.match(wizardHtml, /id="wizard-platform-twitch"/)
assert.match(wizardHtml, /id="go-live-wizard-panel-details"/)
assert.match(wizardHtml, /id="go-live-wizard-panel-chat"/)
assert.equal(wizardHtml.includes('go-live-wizard-panel-validate'), false)
assert.equal(wizardHtml.includes('Category comes from Go Live'), false)
assert.match(wizardHtml, /id="stream-thumb-img"/)
const relayConfig = readFileSync(new URL('../src/shared/relay-config.ts', import.meta.url), 'utf8')
assert.match(relayConfig, /body\.streamTitle = title/)
assert.match(relayConfig, /body\.streamCategory = category/)
assert.match(relayConfig, /body\.streamDescription = description/)
assert.equal(sanitizeYouTubeDescription('x'.repeat(240)).length, 200)
assert.match(wizardHtml, /id="go-live-wizard-description"/)
assert.match(wizardHtml, /maxlength="200"/)
const labeled = rewriteWhipOfferMsids(
  [
    'v=0',
    'a=msid-semantic: WMS old-video old-audio',
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    'a=msid:old-video track-v',
    'a=ssrc:1 msid:old-video track-v',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'a=msid:old-audio track-a',
    'a=ssrc:2 msid:old-audio track-a',
    '',
  ].join('\n'),
  ['gameplay', 'desktop-audio'],
)
assert.match(labeled, /a=msid:gameplay track-v/)
assert.match(labeled, /a=msid:desktop-audio track-a/)
assert.match(labeled, /a=ssrc:2 msid:desktop-audio track-a/)
assert.match(labeled, /a=msid-semantic: WMS gameplay desktop-audio/)
assert.equal(wizardHtml.includes('id="program-output-mode"'), false)
assert.equal(wizardHtml.includes('Browser Mode'), false)
assert.match(appTs, /postRelayConfig\(snapshot\.health, relayConfigForIngest\('primary'\)\)/)

console.log('studio-wiring tests passed')
