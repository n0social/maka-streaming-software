import type {
  AppMode,
  BrowseTabInfo,
  CaptureSource,
  DiagEvent,
  TabcastBridge,
} from '../preload/index'
import type { RelaySnapshot } from '../shared/relay-snapshot'
import type { StreamProfile } from '../shared/tabcast'
import { validateRelayStreamKeys } from '../shared/stream-keys'
import {
  authHeaders,
  defaultSceneLayout,
  postRelayConfig,
  postSceneLayout,
  stopRelayStream,
  verifyRelayConfig,
  whipUrlFromHealth,
} from './relay-client'
import { publishWhip, type WhipPublisher } from './whip'

declare global {
  interface Window {
    tabcast: TabcastBridge
  }
}

const body = document.body
const navrow = document.getElementById('navrow')!
const browsetabs = document.getElementById('browsetabs')!
const browseTabList = document.getElementById('browse-tab-list')!
const urlInput = document.getElementById('url-input') as HTMLInputElement
const urlForm = document.getElementById('url-form') as HTMLFormElement
const relayChip = document.getElementById('relay-chip')!
const relayLabel = document.getElementById('relay-label')!
const relayStatus = document.getElementById('relay-status')!
const relayVersion = document.getElementById('relay-version')!
const relayError = document.getElementById('relay-error')!
const sourceList = document.getElementById('source-list')!
const programVideo = document.getElementById('program-video') as HTMLVideoElement
const programEmpty = document.getElementById('program-empty')!
const pipVideo = document.getElementById('pip-video') as HTMLVideoElement
const pipEmpty = document.getElementById('pip-empty')!
const cameraSelect = document.getElementById('camera-select') as HTMLSelectElement
const micSelect = document.getElementById('mic-select') as HTMLSelectElement
const profileSelect = document.getElementById('profile-select') as HTMLSelectElement
const camScale = document.getElementById('cam-scale') as HTMLInputElement
const micMeter = document.getElementById('mic-meter')!
const destTwitch = document.getElementById('dest-twitch') as HTMLInputElement
const destYoutube = document.getElementById('dest-youtube') as HTMLInputElement
const twitchKey = document.getElementById('twitch-key') as HTMLInputElement
const youtubeKey = document.getElementById('youtube-key') as HTMLInputElement
const destHint = document.getElementById('dest-hint')!
const destError = document.getElementById('dest-error')!
const ffmpegLog = document.getElementById('ffmpeg-log')!
const diagDrawer = document.getElementById('diag-drawer')!
const settingsDialog = document.getElementById('settings-dialog') as HTMLDialogElement
const btnGoLive = document.getElementById('btn-go-live') as HTMLButtonElement
const layerGame = document.getElementById('layer-game')!
const layerCam = document.getElementById('layer-cam')!
const layerMic = document.getElementById('layer-mic')!
const layerBrowser = document.getElementById('layer-browser')!

let selectedSourceId: string | null = null
let programStream: MediaStream | null = null
let cameraStream: MediaStream | null = null
let micStream: MediaStream | null = null
let currentMode: AppMode = 'studio'
let whipPublisher: WhipPublisher | null = null
let goingLive = false
let micMuted = false
let labMode = false
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let meterRaf = 0
const layerEnabled = {
  game: true,
  cam: true,
  mic: true,
  browser: false,
}

const lifecycleCopy: Record<RelaySnapshot['lifecycle'], string> = {
  stopped: 'Relay offline',
  starting: 'Relay starting…',
  ready: 'Relay ready',
  live: 'LIVE',
  error: 'Relay error',
}

function setDestError(message: string | null): void {
  if (!message) {
    destError.hidden = true
    destError.textContent = ''
    return
  }
  destError.hidden = false
  destError.textContent = message
}

function applyMode(mode: AppMode): void {
  currentMode = mode
  body.dataset.mode = mode
  navrow.hidden = mode !== 'browse'
  browsetabs.hidden = mode !== 'browse'

  for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
    const active = tab.dataset.tab === mode
    tab.classList.toggle('active', active)
    tab.setAttribute('aria-selected', active ? 'true' : 'false')
  }

  if (mode === 'browse') {
    void window.tabcast.listTabs().then(renderBrowseTabs)
  }
}

function renderBrowseTabs(tabs: BrowseTabInfo[]): void {
  browseTabList.innerHTML = ''
  for (const tab of tabs) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'browse-tab' + (tab.active ? ' active' : '')
    btn.title = tab.url
    const label = document.createElement('span')
    label.textContent = tab.title || 'Tab'
    btn.appendChild(label)
    if (!tab.pinned) {
      const close = document.createElement('button')
      close.type = 'button'
      close.className = 'close'
      close.textContent = '×'
      close.addEventListener('click', (e) => {
        e.stopPropagation()
        void window.tabcast.closeTab(tab.id).then(renderBrowseTabs)
      })
      btn.appendChild(close)
    }
    btn.addEventListener('click', () => {
      void window.tabcast.activateTab(tab.id).then(renderBrowseTabs)
    })
    browseTabList.appendChild(btn)
  }
}

function startMicMeter(stream: MediaStream): void {
  stopMicMeter()
  try {
    audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      if (!analyser) return
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (const v of data) sum += v
      const avg = sum / data.length / 255
      micMeter.style.width = `${Math.min(100, Math.round(avg * 140))}%`
      meterRaf = requestAnimationFrame(tick)
    }
    tick()
  } catch {
    micMeter.style.width = '0%'
  }
}

function stopMicMeter(): void {
  if (meterRaf) cancelAnimationFrame(meterRaf)
  meterRaf = 0
  analyser = null
  if (audioCtx) {
    void audioCtx.close()
    audioCtx = null
  }
  micMeter.style.width = '0%'
}

function syncLayerTracks(): void {
  if (programStream) {
    for (const track of programStream.getVideoTracks()) {
      track.enabled = layerEnabled.game
    }
  }
  if (cameraStream) {
    for (const track of cameraStream.getVideoTracks()) {
      track.enabled = layerEnabled.cam
    }
  }
  if (micStream) {
    for (const track of micStream.getAudioTracks()) {
      track.enabled = layerEnabled.mic && !micMuted
    }
  }
  layerGame.dataset.enabled = layerEnabled.game ? '1' : '0'
  layerCam.dataset.enabled = layerEnabled.cam ? '1' : '0'
  layerMic.dataset.enabled = layerEnabled.mic ? '1' : '0'
  layerBrowser.dataset.enabled = layerEnabled.browser ? '1' : '0'
}

async function pushSceneLayout(): Promise<void> {
  const snapshot = await window.tabcast.getRelay()
  if (!snapshot.health) return
  const profile = selectedProfile()
  const layout = defaultSceneLayout({
    profile,
    hasWebcam: Boolean(cameraStream) && layerEnabled.cam,
  })
  const scale = Number(camScale.value) / 100
  const cam = layout.sources.find((s) => s.id === 'webcam')
  if (cam) {
    cam.width = Math.round(layout.canvas.width * scale)
    cam.height = Math.round(cam.width * (9 / 16))
    cam.x = layout.canvas.width - cam.width - 24
    cam.y = layout.canvas.height - cam.height - 24
  }
  if (!layerEnabled.game) {
    layout.sources = layout.sources.filter((s) => s.id !== 'gameplay')
  }
  await postSceneLayout(snapshot.health, layout)
}

function renderRelay(snapshot: RelaySnapshot): void {
  relayChip.dataset.state = snapshot.lifecycle
  relayLabel.textContent = lifecycleCopy[snapshot.lifecycle]
  relayStatus.textContent = snapshot.status?.status ?? snapshot.lifecycle
  relayVersion.textContent = snapshot.health ? `v${snapshot.health.version}` : '—'

  if (snapshot.error) {
    relayError.hidden = false
    relayError.textContent = snapshot.error
  } else {
    relayError.hidden = true
    relayError.textContent = ''
  }

  if (snapshot.restarts && snapshot.restarts > 0 && snapshot.lifecycle !== 'ready' && snapshot.lifecycle !== 'live') {
    relayLabel.textContent = `${lifecycleCopy[snapshot.lifecycle]} · r${snapshot.restarts}`
  }

  const live = snapshot.lifecycle === 'live' || Boolean(whipPublisher)
  btnGoLive.dataset.live = live ? '1' : '0'
  if (!goingLive) {
    btnGoLive.textContent = live ? 'End Live' : 'Go Live'
  }

  const lines = snapshot.status?.ffmpegLog
  if (lines?.length) {
    ffmpegLog.textContent = lines.join('\n')
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function stopStream(stream: MediaStream | null): void {
  if (!stream) return
  for (const track of stream.getTracks()) track.stop()
}

function selectedProfile(): StreamProfile {
  return profileSelect.value === '1080p' ? '1080p' : '720p'
}

function syncDestinationInputs(): void {
  twitchKey.disabled = !destTwitch.checked
  youtubeKey.disabled = !destYoutube.checked
}

function renderSources(sources: CaptureSource[]): void {
  sourceList.innerHTML = ''
  if (!sources.length) {
    sourceList.innerHTML = '<p class="hint">No sources found.</p>'
    return
  }

  for (const source of sources) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'source-card' + (source.id === selectedSourceId ? ' active' : '')
    btn.dataset.id = source.id
    btn.innerHTML = `
      <img src="${source.thumbnailDataUrl}" alt="" />
      <span>
        <strong>${escapeHtml(source.name)}</strong>
        <span>${source.type}</span>
      </span>
    `
    btn.addEventListener('click', () => {
      void selectDesktopSource(source)
    })
    sourceList.appendChild(btn)
  }
}

async function selectDesktopSource(source: CaptureSource): Promise<void> {
  selectedSourceId = source.id
  for (const el of sourceList.querySelectorAll('.source-card')) {
    el.classList.toggle('active', (el as HTMLElement).dataset.id === source.id)
  }

  stopStream(programStream)
  programStream = null

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 60,
        },
      } as MediaTrackConstraints,
    })
    programStream = stream
    programVideo.srcObject = stream
    programEmpty.hidden = true
    layerGame.dataset.active = '1'
    layerGame.textContent = `Gameplay — ${source.name}`
    if (currentMode !== 'studio') {
      await window.tabcast.setMode('studio')
    }
  } catch (err) {
    programVideo.srcObject = null
    programEmpty.hidden = false
    programEmpty.textContent =
      err instanceof Error ? err.message : 'Could not capture this source'
    layerGame.dataset.active = '0'
    layerGame.textContent = 'Gameplay — none'
  }
}

async function refreshSources(): Promise<void> {
  const sources = await window.tabcast.listCaptureSources()
  renderSources(sources)
}

async function refreshAvDevices(): Promise<void> {
  try {
    await navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((s) => {
        stopStream(s)
      })
      .catch(() => undefined)
  } catch {
    // ignore
  }

  const devices = await navigator.mediaDevices.enumerateDevices()
  const cams = devices.filter((d) => d.kind === 'videoinput')
  const mics = devices.filter((d) => d.kind === 'audioinput')

  const camValue = cameraSelect.value
  const micValue = micSelect.value

  cameraSelect.innerHTML = '<option value="">No camera</option>'
  for (const cam of cams) {
    const opt = document.createElement('option')
    opt.value = cam.deviceId
    opt.textContent = cam.label || `Camera ${cameraSelect.options.length}`
    cameraSelect.appendChild(opt)
  }

  micSelect.innerHTML = '<option value="">No microphone</option>'
  for (const mic of mics) {
    const opt = document.createElement('option')
    opt.value = mic.deviceId
    opt.textContent = mic.label || `Mic ${micSelect.options.length}`
    micSelect.appendChild(opt)
  }

  if ([...cameraSelect.options].some((o) => o.value === camValue)) cameraSelect.value = camValue
  if ([...micSelect.options].some((o) => o.value === micValue)) micSelect.value = micValue
}

async function applyCamera(): Promise<void> {
  stopStream(cameraStream)
  cameraStream = null
  pipVideo.srcObject = null
  pipVideo.hidden = true
  pipEmpty.hidden = false
  layerCam.dataset.active = '0'
  layerCam.textContent = 'Webcam — off'

  const deviceId = cameraSelect.value
  if (!deviceId) return

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    cameraStream = stream
    pipVideo.srcObject = stream
    pipVideo.hidden = false
    pipEmpty.hidden = true
    layerCam.dataset.active = '1'
    layerCam.textContent = `Webcam — ${cameraSelect.selectedOptions[0]?.textContent ?? 'on'}`
  } catch (err) {
    pipEmpty.hidden = false
    pipEmpty.textContent = err instanceof Error ? err.message : 'Camera failed'
  }
}

async function applyMic(): Promise<void> {
  stopStream(micStream)
  micStream = null
  stopMicMeter()
  layerMic.dataset.active = '0'
  layerMic.textContent = 'Mic — off'
  micMuted = false

  const deviceId = micSelect.value
  if (!deviceId) return

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
      video: false,
    })
    micStream = stream
    layerMic.dataset.active = '1'
    layerMic.textContent = `Mic — ${micSelect.selectedOptions[0]?.textContent ?? 'on'}`
    startMicMeter(stream)
    syncLayerTracks()
  } catch (err) {
    layerMic.textContent =
      err instanceof Error ? `Mic — ${err.message}` : 'Mic — failed'
    stopMicMeter()
  }
}

function toggleMicMute(): void {
  if (!micStream) return
  micMuted = !micMuted
  for (const track of micStream.getAudioTracks()) {
    track.enabled = !micMuted
  }
  const label = micSelect.selectedOptions[0]?.textContent ?? 'on'
  layerMic.textContent = micMuted ? `Mic — muted (${label})` : `Mic — ${label}`
}

async function endLive(): Promise<void> {
  goingLive = true
  btnGoLive.disabled = true
  btnGoLive.textContent = 'Ending…'
  setDestError(null)

  try {
    if (whipPublisher) {
      await whipPublisher.close()
      whipPublisher = null
    }
    const snapshot = await window.tabcast.getRelay()
    await stopRelayStream(snapshot.health)
    await window.tabcast.refreshRelay()
  } catch (err) {
    setDestError(err instanceof Error ? err.message : String(err))
  } finally {
    goingLive = false
    btnGoLive.disabled = false
    btnGoLive.dataset.live = '0'
    btnGoLive.textContent = 'Go Live'
  }
}

async function goLive(): Promise<void> {
  goingLive = true
  btnGoLive.disabled = true
  btnGoLive.textContent = 'Starting…'
  setDestError(null)

  try {
    if (!programStream) {
      throw new Error('Select a display or window source first.')
    }

    const twitch = destTwitch.checked ? twitchKey.value : ''
    const youtube = destYoutube.checked ? youtubeKey.value : ''
    if (!labMode) {
      const keysOk = validateRelayStreamKeys({ twitchKey: twitch, youtubeKey: youtube })
      if (!keysOk.ok) throw new Error(keysOk.message)
    } else if (!twitch && !youtube) {
      throw new Error('Lab mode still needs a placeholder key in at least one destination.')
    }

    let snapshot = await window.tabcast.getRelay()
    if (snapshot.lifecycle === 'stopped' || snapshot.lifecycle === 'error') {
      snapshot = await window.tabcast.startRelay()
    }
    if (!snapshot.health) {
      throw new Error(snapshot.error ?? 'Relay is not ready. Start the relay first.')
    }

    const profile = selectedProfile()
    await postRelayConfig(snapshot.health, {
      twitchKey: twitch,
      youtubeKey: youtube,
      profile,
    })

    await postSceneLayout(
      snapshot.health,
      defaultSceneLayout({ profile, hasWebcam: Boolean(cameraStream) && layerEnabled.cam }),
    )
    await pushSceneLayout()

    destHint.textContent = 'Publishing WHIP to local relay…'

    const publisher = await publishWhip(
      whipUrlFromHealth(snapshot.health),
      {
        display: programStream,
        webcam: layerEnabled.cam ? cameraStream : null,
        mic: layerEnabled.mic ? micStream : null,
      },
      authHeaders(snapshot.health),
      (state) => {
        if (state === 'failed' || state === 'disconnected') {
          setDestError(`WHIP connection ${state}`)
        }
      },
    )

    whipPublisher = publisher
    await window.tabcast.refreshRelay()
    destHint.textContent = 'Live — keys stay in relay RAM. End Live to tear down WHIP.'
    btnGoLive.dataset.live = '1'
    btnGoLive.textContent = 'End Live'
  } catch (err) {
    setDestError(err instanceof Error ? err.message : String(err))
    if (whipPublisher) {
      await whipPublisher.close().catch(() => undefined)
      whipPublisher = null
    }
    btnGoLive.dataset.live = '0'
    btnGoLive.textContent = 'Go Live'
  } finally {
    goingLive = false
    btnGoLive.disabled = false
  }
}

async function onGoLiveClick(): Promise<void> {
  const snapshot = await window.tabcast.getRelay()
  const live = snapshot.lifecycle === 'live' || Boolean(whipPublisher)
  if (live) {
    await endLive()
    return
  }
  await goLive()
}

async function onVerifyKeys(): Promise<void> {
  setDestError(null)
  destHint.textContent = 'Verifying…'

  try {
    const twitch = destTwitch.checked ? twitchKey.value : ''
    const youtube = destYoutube.checked ? youtubeKey.value : ''
    const keysOk = validateRelayStreamKeys({ twitchKey: twitch, youtubeKey: youtube })
    if (!keysOk.ok) throw new Error(keysOk.message)

    let snapshot = await window.tabcast.getRelay()
    if (!snapshot.health) {
      snapshot = await window.tabcast.startRelay()
    }
    if (!snapshot.health) {
      throw new Error(snapshot.error ?? 'Relay is not ready.')
    }

    await postRelayConfig(snapshot.health, {
      twitchKey: twitch,
      youtubeKey: youtube,
      profile: selectedProfile(),
    })

    const result = await verifyRelayConfig(snapshot.health)
    if (!result.ok) {
      const parts = [
        result.message,
        result.twitch && !result.twitch.ok ? `Twitch: ${result.twitch.message ?? 'failed'}` : null,
        result.youtube && !result.youtube.ok
          ? `YouTube: ${result.youtube.message ?? 'failed'}`
          : null,
      ].filter(Boolean)
      throw new Error(parts.join('\n') || 'Verification failed')
    }

    destHint.textContent = result.message ?? 'Keys look good.'
  } catch (err) {
    setDestError(err instanceof Error ? err.message : String(err))
    destHint.textContent = 'Keys stay in relay RAM only. Go Live publishes WHIP to localhost — not OBS.'
  }
}

for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
  tab.addEventListener('click', () => {
    const mode = tab.dataset.tab as AppMode
    void window.tabcast.setMode(mode)
  })
}

urlForm.addEventListener('submit', (event) => {
  event.preventDefault()
  void window.tabcast.navigate(urlInput.value)
})

document.getElementById('btn-back')!.addEventListener('click', () => {
  void window.tabcast.back()
})
document.getElementById('btn-forward')!.addEventListener('click', () => {
  void window.tabcast.forward()
})
document.getElementById('btn-reload')!.addEventListener('click', () => {
  void window.tabcast.reload()
})
document.getElementById('btn-refresh-sources')!.addEventListener('click', () => {
  void refreshSources()
})
document.getElementById('btn-start-relay')!.addEventListener('click', () => {
  void window.tabcast.startRelay()
})
document.getElementById('btn-stop-relay')!.addEventListener('click', () => {
  void window.tabcast.stopRelay()
})
document.getElementById('btn-reveal-relay')!.addEventListener('click', () => {
  void window.tabcast.revealRelay()
})
document.getElementById('btn-new-tab')!.addEventListener('click', () => {
  void window.tabcast.newTab().then((t) => {
    if (t) void window.tabcast.listTabs().then(renderBrowseTabs)
  })
})
document.getElementById('btn-pin-twitch')!.addEventListener('click', () => {
  void window.tabcast.openPinned('pin-twitch').then(renderBrowseTabs)
})
document.getElementById('btn-pin-yt')!.addEventListener('click', () => {
  void window.tabcast.openPinned('pin-yt-studio').then(renderBrowseTabs)
})
document.getElementById('btn-pin-chat')!.addEventListener('click', () => {
  void window.tabcast.openPinned('pin-chat').then(renderBrowseTabs)
})
document.getElementById('btn-popout-chat')!.addEventListener('click', () => {
  void window.tabcast.popoutChat()
})
document.getElementById('btn-win-min')!.addEventListener('click', () => {
  void window.tabcast.windowMinimize()
})
document.getElementById('btn-win-max')!.addEventListener('click', () => {
  void window.tabcast.windowMaximize()
})
document.getElementById('btn-win-close')!.addEventListener('click', () => {
  void window.tabcast.windowClose()
})
document.getElementById('btn-settings')!.addEventListener('click', async () => {
  const s = await window.tabcast.getSettings()
  ;(document.getElementById('set-tray-live') as HTMLInputElement).checked = s.minimizeToTrayWhileLive
  ;(document.getElementById('set-lab-mode') as HTMLInputElement).checked = s.labMode
  ;(document.getElementById('set-startup') as HTMLSelectElement).value = s.startupMode
  settingsDialog.showModal()
})
document.getElementById('settings-form')!.addEventListener('submit', async (event) => {
  const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null
  if (submitter?.value === 'save') {
    const next = await window.tabcast.setSettings({
      minimizeToTrayWhileLive: (document.getElementById('set-tray-live') as HTMLInputElement)
        .checked,
      labMode: (document.getElementById('set-lab-mode') as HTMLInputElement).checked,
      startupMode: (document.getElementById('set-startup') as HTMLSelectElement).value as AppMode,
    })
    labMode = next.labMode
    destHint.textContent = labMode
      ? 'Lab mode on — key shape checks relaxed for classroom demos.'
      : 'Keys stay in relay RAM only. Go Live publishes WHIP to localhost.'
  }
})
camScale.addEventListener('change', () => {
  void pushSceneLayout()
})
for (const [el, key] of [
  [layerGame, 'game'],
  [layerCam, 'cam'],
  [layerMic, 'mic'],
  [layerBrowser, 'browser'],
] as const) {
  el.addEventListener('click', () => {
    layerEnabled[key] = !layerEnabled[key]
    syncLayerTracks()
    void pushSceneLayout()
  })
}
document.getElementById('btn-verify')!.addEventListener('click', () => {
  void runVerification()
})
document.getElementById('btn-toggle-diag')!.addEventListener('click', () => {
  diagDrawer.hidden = !diagDrawer.hidden
  if (!diagDrawer.hidden) {
    void refreshDiagnostics()
  }
})
document.getElementById('btn-verify-keys')!.addEventListener('click', () => {
  void onVerifyKeys()
})

window.tabcast.onTabs(renderBrowseTabs)

void window.tabcast.getSettings().then((s) => {
  labMode = s.labMode
  profileSelect.value = s.bitrateProfile
})

function formatDiag(events: DiagEvent[]): string {
  if (!events.length) return 'No diagnostics yet.'
  return events
    .slice()
    .reverse()
    .slice(0, 40)
    .map((e) => {
      const time = e.at.slice(11, 19)
      const stack = e.stack ? `\n${e.stack}` : ''
      return `[${time}] ${e.level.toUpperCase()} ${e.source}\n${e.message}${stack}`
    })
    .join('\n\n')
}

async function refreshDiagnostics(): Promise<void> {
  const events = await window.tabcast.listDiagnostics()
  diagDrawer.textContent = formatDiag(events)
  diagDrawer.dataset.fail = events.some((e) => e.level === 'error' || e.level === 'fatal')
    ? '1'
    : '0'
}

async function runVerification(): Promise<void> {
  diagDrawer.hidden = false
  diagDrawer.textContent = 'Running verification…'
  const report = await window.tabcast.verifySystem()
  const lines = report.checks.map((c) => `${c.ok ? 'OK ' : 'FAIL'}  ${c.name} — ${c.detail}`)
  lines.unshift(report.ok ? 'Verification PASSED' : 'Verification FAILED')
  lines.push('', 'Recent diagnostics:', formatDiag(report.diagnostics))
  diagDrawer.textContent = lines.join('\n')
  diagDrawer.dataset.fail = report.ok ? '0' : '1'
  if (!report.ok) {
    setDestError('System verification failed — see Diagnostics.')
  }
}

window.tabcast.onDiagnostic((event) => {
  if (event.level === 'error' || event.level === 'fatal') {
    diagDrawer.hidden = false
  }
  if (!diagDrawer.hidden) {
    void refreshDiagnostics()
  }
})

window.addEventListener('error', (event) => {
  diagDrawer.hidden = false
  diagDrawer.dataset.fail = '1'
  diagDrawer.textContent =
    `Renderer error\n${event.message}\n${event.filename}:${event.lineno}\n${event.error?.stack ?? ''}`
})

window.addEventListener('unhandledrejection', (event) => {
  diagDrawer.hidden = false
  diagDrawer.dataset.fail = '1'
  const reason = event.reason
  const message = reason instanceof Error ? reason.message : String(reason)
  const stack = reason instanceof Error ? reason.stack : ''
  diagDrawer.textContent = `Unhandled rejection\n${message}\n${stack ?? ''}`
})
document.getElementById('btn-toggle-log')!.addEventListener('click', () => {
  ffmpegLog.hidden = !ffmpegLog.hidden
})

cameraSelect.addEventListener('change', () => {
  void applyCamera()
})
micSelect.addEventListener('change', () => {
  void applyMic()
})
destTwitch.addEventListener('change', syncDestinationInputs)
destYoutube.addEventListener('change', syncDestinationInputs)

btnGoLive.addEventListener('click', () => {
  void onGoLiveClick()
})

window.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
    return
  }

  if (event.key === 'F8' || (event.ctrlKey && event.key.toLowerCase() === 'l')) {
    event.preventDefault()
    void onGoLiveClick()
  }
  if (event.key === 'F9' || (event.ctrlKey && event.key.toLowerCase() === 'm')) {
    event.preventDefault()
    toggleMicMute()
  }
  if (event.ctrlKey && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    void window.tabcast.setMode(currentMode === 'browse' ? 'studio' : 'browse')
  }
})

window.tabcast.onMode(applyMode)
window.tabcast.onNavigated((state) => {
  urlInput.value = state.url
})
window.tabcast.onTitle((title) => {
  document.title = title ? `${title} · Tabcast` : 'Tabcast'
})

syncDestinationInputs()
void window.tabcast.getMode().then(applyMode)
void window.tabcast.getRelay().then(renderRelay)
window.tabcast.onRelayUpdate(renderRelay)
void window.tabcast.getBrowserState().then((state) => {
  if (state) urlInput.value = state.url
})
void refreshSources()
void refreshAvDevices()
