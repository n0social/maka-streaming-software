import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { killProcessTree } from '../src/main/process-tree.ts'
import { nextCustomSceneId, removeCustomScene } from '../src/shared/custom-scenes.ts'
import { alertBoxPageUrl, alertCard, parseTwitchIrcAlert, streamChatUrl } from '../src/shared/stream-overlays.ts'
import { isTwitchStreamKey, sanitizeYouTubeDescription, streamKeyValid, youtubeVideoId } from '../src/shared/stream-wizard.ts'
import { relayControlStatusShouldRetry, WHIP_DISCONNECT_GRACE_MS } from '../src/shared/live-retry.ts'
import { hardenWhipMediaSdp } from '../src/shared/whip-sdp.ts'
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
assert.match(relayConfig, /body\.streamDescription = youtube && description \? description : ''/)
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
const hardened = hardenWhipMediaSdp(
  [
    'v=0',
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    'a=rtpmap:96 H264/90000',
    'a=candidate:1 1 tcp 1 127.0.0.1 9 typ host',
    'a=candidate:2 1 udp 2 127.0.0.1 9 typ host',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10',
    '',
  ].join('\n'),
)
assert.match(hardened, /a=rtcp-fb:96 nack\n/)
assert.match(hardened, /a=rtcp-fb:96 nack pli/)
assert.match(hardened, /useinbandfec=1/)
const videoCandidates = hardened.split('m=audio')[0]
assert.ok(videoCandidates.indexOf(' udp ') < videoCandidates.indexOf(' tcp '))
assert.equal(relayControlStatusShouldRetry(503), true)
assert.equal(relayControlStatusShouldRetry(401), false)
assert.equal(WHIP_DISCONNECT_GRACE_MS, 2_000)
assert.match(wizardHtml, /id="app-intro"/)
assert.match(wizardHtml, /id="app-intro-stream">Stream/)
assert.match(wizardHtml, /assets\/maka-wordmark\.png/)
assert.equal(wizardHtml.includes('id="tab-stream"'), false)
assert.match(wizardHtml, /class="mark"[^>]*>M</)
assert.equal(wizardHtml.includes('id="btn-go-live"'), false)
assert.match(wizardHtml, /id="btn-go-live-sidebar"/)
assert.match(wizardHtml, /id="twitch-chat-link"/)
assert.match(wizardHtml, /id="youtube-chat-link"/)
assert.match(appTs, /End Stream/)
assert.equal(wizardHtml.includes('id="program-output-mode"'), false)
assert.equal(wizardHtml.includes('Browser Mode'), false)
assert.match(appTs, /postRelayConfig\(snapshot\.health, relayConfigForIngest\('primary'\)\)/)
assert.match(appTs, /Save Twitch key/)
assert.match(appTs, /Save YouTube key/)
assert.match(appTs, /dataset\.key = streamKeyValid/)
assert.equal(streamKeyValid('twitch', 'live_saved_key_1234567890'), true)
assert.equal(streamKeyValid('twitch', 'not-a-key'), false)
assert.equal(streamKeyValid('youtube', 'abcd-efgh-ijkl-mnop'), true)
assert.equal(streamKeyValid('youtube', ''), false)

const onboardingTs = readFileSync(new URL('../src/renderer/onboarding.ts', import.meta.url), 'utf8')
assert.equal(onboardingTs.includes('start the relay on the left'), false)
assert.match(onboardingTs, /turns on when Maka opens/)
const relayTs = readFileSync(new URL('../src/main/relay.ts', import.meta.url), 'utf8')
const mainTs = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
assert.match(relayTs, /detached: true/)
assert.match(relayTs, /killProcessTree/)
assert.match(mainTs, /void relay\.start\(\)/)

const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  detached: true,
  stdio: 'ignore',
})
const sleeperPid = sleeper.pid
assert.ok(sleeperPid)
await new Promise((resolve) => setTimeout(resolve, 150))
killProcessTree(sleeperPid)
await new Promise((resolve) => setTimeout(resolve, 200))
let sleeperGone = false
try {
  process.kill(sleeperPid, 0)
} catch {
  sleeperGone = true
}
assert.equal(sleeperGone, true)

console.log('studio-wiring tests passed')
