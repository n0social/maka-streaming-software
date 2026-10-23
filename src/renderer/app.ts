import type {
  AppMode,
  BrowseTabInfo,
  CaptureSource,
  DiagEvent,
  TabcastBridge,
} from '../preload/index'
import type { RelaySnapshot } from '../shared/relay-snapshot'
import type { StreamProfile, SceneLayout, RelayHealth } from '../shared/tabcast'
import { BROWSE_CAPTURE_SOURCE_ID } from '../shared/capture'
import {
  BACKUP_INGEST_STATUS,
  nextIngestTargetAfterFailedRecovery,
  resolveCustomRtmpForPost,
  type IngestTarget,
} from '../shared/ingest-failover'
import { validateRelayStreamKeys, KICK_RTMP_URL } from '../shared/stream-keys'
import {
  authHeaders,
  defaultSceneLayout,
  isFatalLiveRecoveryReason,
  liveRecoveryAttemptCap,
  liveRecoveryReasonLabel,
  liveRetryBackoffMs,
  MAX_LIVE_RETRY_ATTEMPTS,
  postRelayConfig,
  postSceneLayout,
  relayNeedsLiveBootstrap,
  stopRelayStream,
  verifyRelayConfig,
  waitForRelayReady,
  whipUrlFromHealth,
} from './relay-client'
import {
  publishWhip,
  startWhipVideoWatchdog,
  type WhipPublisher,
  type WhipVideoWatchdog,
} from './whip'
import { OnboardingTour } from './onboarding'
import { SetupWizard } from './onboarding-wizard'
import { initMarketplace } from './marketplace'
import {
  getPhoneTracksSnapshot,
  initPhoneTracks,
  PHONE_CAMERA_DEVICE_VALUE,
  PHONE_MIC_DEVICE_VALUE,
  phoneHasAudioTrack,
  phoneHasVideoTrack,
  subscribePhoneTracks,
} from './phone-tracks'
import './onboarding.css'

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
const programCam = document.getElementById('program-cam')!
const programCamVideo = document.getElementById('program-cam-video') as HTMLVideoElement
const programCamOffline = document.getElementById('program-cam-offline')!
const pip = document.getElementById('pip')!
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
const addonPanels = document.getElementById('addon-panels')!
const platTwitch = document.getElementById('plat-twitch')!
const platYoutube = document.getElementById('plat-youtube')!
const platCustom = document.getElementById('plat-custom')!
const destCustomBlock = document.getElementById('dest-custom-block')!
const destCustom = document.getElementById('dest-custom') as HTMLInputElement
const customRtmpUrl = document.getElementById('custom-rtmp-url') as HTMLInputElement
const customRtmpKey = document.getElementById('custom-rtmp-key') as HTMLInputElement
const backupRtmpUrl = document.getElementById('backup-rtmp-url') as HTMLInputElement
const backupRtmpKey = document.getElementById('backup-rtmp-key') as HTMLInputElement
const programBrowser = document.getElementById('program-browser')!
const programBrowserVideo = document.getElementById('program-browser-video') as HTMLVideoElement
const brandTag = document.getElementById('brand-tag')

const CUSTOM_RTM_ADDON_ID = 'com.tabcast.custom-rtmp'

let selectedSourceId: string | null = null
let captureKind: 'desktop' | 'browse' | null = null
let liveRecoveryAttempts = 0
let liveReconnecting = false
let liveRecoveryExhausted = false
let liveRecoveryReason: string | null = null
let liveRecoveryFatal = false
let sessionLiveIntent = false
let liveReconnectTimer: ReturnType<typeof setTimeout> | null = null
let liveReconnectRunId = 0
let programStream: MediaStream | null = null
let browserStream: MediaStream | null = null
let cameraStream: MediaStream | null = null
let micStream: MediaStream | null = null
let currentMode: AppMode = 'studio'
let whipPublisher: WhipPublisher | null = null
let whipVideoWatchdog: WhipVideoWatchdog | null = null
let goingLive = false
let micMuted = false
let labMode = false
let pcCameraBeforePhone = ''
let pcMicBeforePhone = ''
let preferPhoneCamera = false
let phoneVideoWasLive = false
let phoneAudioWasLive = false
let sessionIngestTarget: IngestTarget = 'primary'
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let meterRaf = 0
const layerEnabled = {
  game: true,
  cam: true,
  mic: true,
  browser: false,
}

const WEBCAM_OFFLINE_TEXT = 'video is offline'

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
  const searchOpen = mode === 'browse'
  navrow.hidden = !searchOpen
  browsetabs.hidden = !searchOpen

  if (brandTag) {
    brandTag.textContent = searchOpen ? 'Search · optional browser' : 'Streaming studio'
  }
  document.title = searchOpen ? 'Maka — Search' : 'Maka — Streaming'

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
  if (browserStream) {
    for (const track of browserStream.getVideoTracks()) {
      track.enabled = layerEnabled.browser
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
  updateProgramCamOverlay()
  updateProgramBrowserOverlay()
}

function updateProgramBrowserOverlay(): void {
  const show = Boolean(browserStream) && layerEnabled.browser
  programBrowser.hidden = !show
  if (show) {
    if (programBrowserVideo.srcObject !== browserStream) {
      programBrowserVideo.srcObject = browserStream
    }
    void programBrowserVideo.play().catch(() => undefined)
  } else if (!browserStream) {
    programBrowserVideo.srcObject = null
  }
}

function hasLiveWebcamVideo(): boolean {
  return Boolean(
    cameraStream?.getVideoTracks().some((track) => track.readyState === 'live'),
  )
}

function syncWebcamPresentation(camLabel?: string): void {
  const scale = Math.max(12, Math.min(40, Number(camScale.value) || 22))
  programCam.style.width = `${scale}%`

  const layerOn = layerEnabled.cam
  const hasVideo = hasLiveWebcamVideo()

  if (!layerOn) {
    programCam.hidden = true
    programCamVideo.hidden = true
    programCamOffline.hidden = true
    programCamVideo.srcObject = null
    pip.dataset.on = '0'
    pipVideo.hidden = true
    pipEmpty.hidden = false
    pipEmpty.textContent = 'Camera off'
    pipVideo.srcObject = null
    return
  }

  programCam.hidden = false
  if (hasVideo) {
    programCamVideo.hidden = false
    programCamOffline.hidden = true
    if (programCamVideo.srcObject !== cameraStream) {
      programCamVideo.srcObject = cameraStream
    }
    void programCamVideo.play().catch(() => undefined)

    pip.dataset.on = '1'
    pipVideo.hidden = false
    pipEmpty.hidden = true
    if (pipVideo.srcObject !== cameraStream) {
      pipVideo.srcObject = cameraStream
    }
    void pipVideo.play().catch(() => undefined)
  } else {
    programCamVideo.hidden = true
    programCamOffline.hidden = false
    programCamOffline.textContent = WEBCAM_OFFLINE_TEXT
    programCamVideo.srcObject = null

    pip.dataset.on = '0'
    pipVideo.hidden = true
    pipEmpty.hidden = false
    pipEmpty.textContent = WEBCAM_OFFLINE_TEXT
    pipVideo.srcObject = null
  }

  if (camLabel) {
    layerCam.textContent = camLabel
  } else if (!hasVideo) {
    layerCam.textContent = 'Webcam — offline'
  }
}

function updateProgramCamOverlay(): void {
  syncWebcamPresentation()
}

async function pushSceneLayout(): Promise<void> {
  const snapshot = await window.tabcast.getRelay()
  if (!snapshot.health) return
  const profile = selectedProfile()
  const layout = defaultSceneLayout({
    profile,
    hasWebcam: hasLiveWebcamVideo() && layerEnabled.cam,
    hasBrowser: Boolean(browserStream) && layerEnabled.browser,
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
  if (!layerEnabled.browser) {
    layout.sources = layout.sources.filter((s) => s.id !== 'browser')
  }
  await postSceneLayout(snapshot.health, layout)
}

function isSessionLive(): boolean {
  return sessionLiveIntent || Boolean(whipPublisher)
}

function clearLiveReconnectTimer(): void {
  if (liveReconnectTimer) {
    clearTimeout(liveReconnectTimer)
    liveReconnectTimer = null
  }
}

function cancelLiveRecovery(): void {
  clearLiveReconnectTimer()
  liveReconnectRunId += 1
  liveReconnecting = false
  liveRecoveryReason = null
  liveRecoveryFatal = false
}

function liveReconnectStatusLine(): string {
  const reason = liveRecoveryReason ?? 'relay:recover'
  const label = liveRecoveryReasonLabel(reason)
  return `${label} — reconnecting (${liveRecoveryAttempts}/${MAX_LIVE_RETRY_ATTEMPTS})`
}

function renderRelay(snapshot: RelaySnapshot): void {
  const live = isSessionLive()
  const relayUiState =
    live && liveReconnecting
      ? 'starting'
      : live && liveRecoveryExhausted
        ? 'error'
        : snapshot.lifecycle

  relayChip.dataset.state = relayUiState
  if (live && liveReconnecting) {
    relayLabel.textContent = liveReconnectStatusLine()
  } else if (live && liveRecoveryExhausted) {
    const label = liveRecoveryReasonLabel(liveRecoveryReason ?? 'relay:recover')
    relayLabel.textContent = liveRecoveryFatal
      ? `${label} — ingest rejected`
      : `${label} — reconnect failed`
  } else {
    relayLabel.textContent = lifecycleCopy[snapshot.lifecycle]
  }
  relayStatus.textContent =
    live && liveReconnecting ? 'reconnecting' : (snapshot.status?.status ?? snapshot.lifecycle)
  relayVersion.textContent = snapshot.health ? `v${snapshot.health.version}` : '—'
  renderPlatformStatus(snapshot)

  if (live && liveRecoveryExhausted) {
    relayError.hidden = false
    const label = liveRecoveryReasonLabel(liveRecoveryReason ?? 'relay:recover')
    relayError.textContent = liveRecoveryFatal
      ? `${label} — stream key or ingest rejected (auto-retry stopped).`
      : `${label} — could not restore the stream after ${MAX_LIVE_RETRY_ATTEMPTS} attempts.`
  } else if (snapshot.error && !(live && liveReconnecting)) {
    relayError.hidden = false
    relayError.textContent = snapshot.error
  } else if (!liveRecoveryExhausted) {
    relayError.hidden = true
    relayError.textContent = ''
  }

  if (
    snapshot.restarts &&
    snapshot.restarts > 0 &&
    snapshot.lifecycle !== 'ready' &&
    snapshot.lifecycle !== 'live' &&
    !(live && liveReconnecting)
  ) {
    relayLabel.textContent = `${lifecycleCopy[snapshot.lifecycle]} · r${snapshot.restarts}`
  }

  btnGoLive.dataset.live = live ? '1' : '0'
  btnGoLive.dataset.exhausted = liveRecoveryExhausted ? '1' : '0'
  if (!goingLive && !liveReconnecting) {
    btnGoLive.textContent = live ? 'End Live' : 'Go Live'
  }

  const lines = snapshot.status?.ffmpegLog
  if (lines?.length) {
    ffmpegLog.textContent = lines.join('\n')
  }
}

type PlatformChipState = 'off' | 'idle' | 'armed' | 'live' | 'error'

function platformChipState(
  enabled: boolean,
  hasKey: boolean,
  live: boolean,
  platformLive: boolean | undefined,
): PlatformChipState {
  if (!enabled) return 'off'
  if (live && platformLive === true) return 'live'
  if (live && platformLive === false) return 'error'
  if (hasKey) return 'armed'
  return 'idle'
}

function renderPlatformStatus(snapshot: RelaySnapshot): void {
  const live = isSessionLive()
  const platforms = snapshot.status?.platforms

  platTwitch.dataset.state = platformChipState(
    destTwitch.checked,
    Boolean(twitchKey.value.trim()),
    live,
    platforms?.twitch,
  )
  platYoutube.dataset.state = platformChipState(
    destYoutube.checked,
    Boolean(youtubeKey.value.trim()),
    live,
    platforms?.youtube,
  )
  platCustom.dataset.state = platformChipState(
    destCustom.checked,
    Boolean(customRtmpKey.value.trim()),
    live,
    platforms?.custom,
  )
}

function bindProgramStream(stream: MediaStream): void {
  bindGameplayStream(stream)
}


function stopWhipVideoWatchdog(): void {
  whipVideoWatchdog?.stop()
  whipVideoWatchdog = null
}

function whipExpectsOutboundVideo(): boolean {
  const gameplay =
    layerEnabled.game &&
    Boolean(programStream?.getVideoTracks().some((t) => t.readyState === 'live'))
  const browser =
    layerEnabled.browser &&
    Boolean(browserStream?.getVideoTracks().some((t) => t.readyState === 'live'))
  const webcam = layerEnabled.cam && hasLiveWebcamVideo()
  return gameplay || browser || webcam
}

function startWhipVideoWatchdogForPublisher(): void {
  stopWhipVideoWatchdog()
  if (!whipPublisher || !sessionLiveIntent) return
  whipVideoWatchdog = startWhipVideoWatchdog({
    pc: whipPublisher.pc,
    shouldExpectVideo: whipExpectsOutboundVideo,
    isLive: () => sessionLiveIntent && !goingLive && !liveReconnecting,
    onVideoStall: (reason) => {
      stopWhipVideoWatchdog()
      queueLiveRecovery(reason)
    },
  })
}

function whipPeerNeedsRecovery(): boolean {
  if (!whipPublisher) return sessionLiveIntent
  const state = whipPublisher.pc.connectionState
  return state === 'failed' || state === 'disconnected' || state === 'closed'
}

function relaySnapshotNeedsRecovery(snapshot: RelaySnapshot): boolean {
  if (!sessionLiveIntent || goingLive || liveRecoveryExhausted) return false
  if (liveReconnecting || liveReconnectTimer) return false

  const whipBad = whipPeerNeedsRecovery()

  if (snapshot.lifecycle === 'starting') {
    return whipBad
  }

  if (snapshot.status?.status === 'error') return true
  if (!snapshot.health && snapshot.lifecycle !== 'stopped') return whipBad || snapshot.lifecycle === 'error'
  if (snapshot.lifecycle === 'error' && !snapshot.error?.includes('auto-restart exhausted')) {
    return true
  }
  if (relayNeedsLiveBootstrap(snapshot)) return true
  return whipBad
}

function onWhipConnectionState(state: RTCPeerConnectionState): void {
  if (!sessionLiveIntent) return
  if (state === 'connected') {
    liveRecoveryAttempts = 0
    liveRecoveryExhausted = false
    liveRecoveryFatal = false
    liveReconnecting = false
    liveRecoveryReason = null
    setDestError(null)
    startWhipVideoWatchdogForPublisher()
    void window.tabcast.getRelay().then(renderRelay)
    return
  }
  if (state === 'failed' || state === 'disconnected' || state === 'closed') {
    stopWhipVideoWatchdog()
    if (goingLive || liveReconnecting) return
    queueLiveRecovery(`whip:${state}`)
  }
}

function enabledDestinationKeysEmpty(): boolean {
  if (destTwitch.checked && !twitchKey.value.trim()) return true
  if (destYoutube.checked && !youtubeKey.value.trim()) return true
  if (destCustom.checked && (!customRtmpUrl.value.trim() || !customRtmpKey.value.trim())) {
    return true
  }
  return false
}

function queueLiveRecovery(reason: string, detail?: string): void {
  if (!sessionLiveIntent || goingLive || liveRecoveryExhausted) return
  if (liveReconnecting || liveReconnectTimer) return

  if (isFatalLiveRecoveryReason(reason, detail)) {
    markLiveRecoveryFatal(reason, detail)
    return
  }

  const cap = liveRecoveryAttemptCap(reason, detail)
  if (liveRecoveryAttempts >= cap) {
    markLiveRecoveryExhausted(reason, detail)
    return
  }

  liveRecoveryReason = reason
  const delay = liveRetryBackoffMs(liveRecoveryAttempts)
  liveReconnectTimer = setTimeout(() => {
    liveReconnectTimer = null
    void runLiveRecovery(reason)
  }, delay)
}

async function repostRelayConfigIfNeeded(snapshot: RelaySnapshot): Promise<RelaySnapshot> {
  if (!snapshot.health) return snapshot
  if (sessionIngestTarget !== 'backup' && !relayNeedsLiveBootstrap(snapshot)) {
    return snapshot
  }

  await postRelayConfig(snapshot.health, relayConfigForIngest(sessionIngestTarget))
  return snapshot
}

async function runLiveRecovery(reason: string): Promise<void> {
  if (!sessionLiveIntent || goingLive || liveRecoveryExhausted) return

  const runId = ++liveReconnectRunId
  liveRecoveryAttempts += 1
  liveReconnecting = true
  liveRecoveryReason = reason
  setDestError(null)
  destHint.textContent = liveReconnectStatusLine()
  void window.tabcast.getRelay().then(renderRelay)

  sessionIngestTarget = nextIngestTargetAfterFailedRecovery(
    sessionIngestTarget,
    reason,
    backupIngestFromUi(),
  )

  try {
    if (!programStream) {
      throw new Error('Program source missing — cannot reconnect live session.')
    }

    stopWhipVideoWatchdog()
    if (whipPublisher) {
      await whipPublisher.close().catch(() => undefined)
      whipPublisher = null
    }

    let snapshot = await window.tabcast.getRelay()
    if (!snapshot.health || snapshot.lifecycle === 'stopped' || snapshot.lifecycle === 'error') {
      snapshot = await window.tabcast.startRelay()
    }

    snapshot = await waitForRelayReady(
      () => window.tabcast.getRelay(),
      async () => {
        await window.tabcast.refreshRelay()
      },
    )

    if (runId !== liveReconnectRunId) return

    if (!snapshot.health) {
      throw new Error(snapshot.error ?? 'Relay not ready for live reconnect.')
    }
    if (snapshot.error?.includes('auto-restart exhausted')) {
      throw new Error(snapshot.error)
    }

    snapshot = await repostRelayConfigIfNeeded(snapshot)
    await window.tabcast.refreshRelay()
    snapshot = await window.tabcast.getRelay()
    if (relayNeedsLiveBootstrap(snapshot)) {
      await pushSceneLayout()
    }

    if (!snapshot.health) {
      throw new Error('Relay health missing after reconnect wait.')
    }

    whipPublisher = await attachWhipPublisher(snapshot.health)
    await window.tabcast.refreshRelay()

    if (runId !== liveReconnectRunId) return

    liveRecoveryAttempts = 0
    liveRecoveryExhausted = false
    liveRecoveryFatal = false
    liveRecoveryReason = null
    destHint.textContent = liveDestHintAfterRecovery()
    setDestError(null)
  } catch (err) {
    if (runId !== liveReconnectRunId) return
    const message = err instanceof Error ? err.message : String(err)
    sessionIngestTarget = nextIngestTargetAfterFailedRecovery(
      sessionIngestTarget,
      reason,
      backupIngestFromUi(),
    )
    if (isFatalLiveRecoveryReason(reason, message)) {
      markLiveRecoveryFatal(reason, message)
    } else if (liveRecoveryAttempts >= liveRecoveryAttemptCap(reason, message)) {
      markLiveRecoveryExhausted(reason, message)
    } else {
      setDestError(message)
      queueLiveRecovery(reason, message)
    }
  } finally {
    if (runId === liveReconnectRunId) {
      liveReconnecting = false
      void window.tabcast.getRelay().then(renderRelay)
    }
  }
}

function markLiveRecoveryExhausted(reason: string, detail?: string): void {
  liveRecoveryExhausted = true
  liveRecoveryFatal = false
  liveReconnecting = false
  liveRecoveryReason = reason
  clearLiveReconnectTimer()
  const label = liveRecoveryReasonLabel(reason)
  const extra = detail ? ` ${detail}` : ''
  setDestError(
    `Live stream dropped (${label}).${extra} Use Retry connection or End Live.`,
  )
  mountRetryConnectionHint(false)
  void window.tabcast.getRelay().then(renderRelay)
}

function markLiveRecoveryFatal(reason: string, detail?: string): void {
  liveRecoveryExhausted = true
  liveRecoveryFatal = true
  liveReconnecting = false
  liveRecoveryReason = reason
  if (liveRecoveryAttempts < 1) liveRecoveryAttempts = 1
  clearLiveReconnectTimer()
  const label = liveRecoveryReasonLabel(reason)
  const extra = (detail ?? reason.replace(/^rtmp:/, '')).trim()
  const keyHint = enabledDestinationKeysEmpty()
    ? ' Enter stream keys in Destinations, then Retry connection or End Live.'
    : ' Use Retry connection or End Live.'
  setDestError(`Live stream stopped (${label}).${extra ? ` ${extra}` : ''}${keyHint}`)
  mountRetryConnectionHint(true)
  void window.tabcast.getRelay().then(renderRelay)
}

function recoveryReasonFromSnapshot(snapshot: RelaySnapshot): string {
  if (snapshot.status?.status === 'error') {
    return `rtmp:${snapshot.status.error ?? 'error'}`
  }
  if (relayNeedsLiveBootstrap(snapshot)) {
    return 'relay:restart'
  }
  if (snapshot.lifecycle === 'error') {
    const err = snapshot.error?.toLowerCase() ?? ''
    if (err.includes('exit') || err.includes('health') || err.includes('recovering')) {
      return 'relay:restart'
    }
    return 'relay:error'
  }
  if (!snapshot.health) return 'relay:health'
  if (whipPeerNeedsRecovery()) {
    const state = whipPublisher?.pc.connectionState ?? 'failed'
    return `whip:${state}`
  }
  return 'relay:recover'
}

function handleRelayLiveRecovery(snapshot: RelaySnapshot): void {
  renderRelay(snapshot)
  if (!relaySnapshotNeedsRecovery(snapshot)) return
  const reason = recoveryReasonFromSnapshot(snapshot)
  const detail = snapshot.status?.error ?? snapshot.error ?? undefined
  if (isFatalLiveRecoveryReason(reason, detail)) {
    markLiveRecoveryFatal(reason, detail)
    return
  }
  queueLiveRecovery(reason, detail)
}

async function attachWhipPublisher(health: RelayHealth): Promise<WhipPublisher> {
  if (!programStream) {
    throw new Error('Select a gameplay source before going live.')
  }
  return publishWhip(
    whipUrlFromHealth(health),
    {
      gameplay: programStream,
      browser: layerEnabled.browser && browserStream ? browserStream : null,
      webcam: layerEnabled.cam ? cameraStream : null,
      mic: layerEnabled.mic ? micStream : null,
    },
    authHeaders(health),
    onWhipConnectionState,
  )
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

function releaseCameraStream(): void {
  if (!cameraStream) return
  const phoneVideo = getPhoneTracksSnapshot().videoTrack
  for (const track of cameraStream.getVideoTracks()) {
    if (track !== phoneVideo) track.stop()
  }
  cameraStream = null
}

function releaseMicStream(): void {
  if (!micStream) return
  const phoneAudio = getPhoneTracksSnapshot().audioTrack
  for (const track of micStream.getAudioTracks()) {
    if (track !== phoneAudio) track.stop()
  }
  micStream = null
}

function selectedProfile(): StreamProfile {
  return profileSelect.value === '1080p' ? '1080p' : '720p'
}

function backupIngestFromUi() {
  return { url: backupRtmpUrl.value, key: backupRtmpKey.value }
}

function primaryCustomFromUi() {
  return { enabled: destCustom.checked, url: customRtmpUrl.value, key: customRtmpKey.value }
}

function relayConfigForIngest(ingestTarget: IngestTarget) {
  const custom = resolveCustomRtmpForPost(ingestTarget, primaryCustomFromUi(), backupIngestFromUi())
  return {
    twitchKey: destTwitch.checked ? twitchKey.value : '',
    youtubeKey: destYoutube.checked ? youtubeKey.value : '',
    customRtmpUrl: custom.url,
    customRtmpKey: custom.key,
    profile: selectedProfile(),
  }
}

function liveDestHintAfterRecovery(): string {
  if (sessionIngestTarget === 'backup') {
    return `Live — ${BACKUP_INGEST_STATUS}. Keys stay in relay RAM.`
  }
  return 'Live — stream recovered. Keys stay in relay RAM.'
}

function syncDestinationInputs(): void {
  twitchKey.disabled = !destTwitch.checked
  youtubeKey.disabled = !destYoutube.checked
  const customEnabled = destCustom.checked
  customRtmpUrl.disabled = !customEnabled
  customRtmpKey.disabled = !customEnabled
  backupRtmpUrl.disabled = !customEnabled
  backupRtmpKey.disabled = !customEnabled
}

function syncCustomRtmpBlock(show: boolean): void {
  destCustomBlock.hidden = !show
  platCustom.hidden = !show
}

async function loadCustomRtmpSettings(): Promise<void> {
  const settings = await window.tabcast.getAddonSettings(CUSTOM_RTM_ADDON_ID)
  if (settings.customRtmpUrl) customRtmpUrl.value = settings.customRtmpUrl
  if (settings.customRtmpKeyConfigured) {
    customRtmpKey.placeholder = 'Stream key saved'
  }
  if (settings.backupRtmpUrl) backupRtmpUrl.value = settings.backupRtmpUrl
  if (settings.backupRtmpKeyConfigured) {
    backupRtmpKey.placeholder = 'Backup stream key saved'
  }
}

async function persistCustomRtmpSettings(): Promise<void> {
  if (destCustomBlock.hidden) return
  await window.tabcast.setAddonSettings(CUSTOM_RTM_ADDON_ID, {
    customRtmpUrl: customRtmpUrl.value.trim(),
    customRtmpKey: customRtmpKey.value.trim() || undefined,
    backupRtmpUrl: backupRtmpUrl.value.trim() || undefined,
    backupRtmpKey: backupRtmpKey.value.trim() || undefined,
  })
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
    const thumbHtml = source.type === 'browser'
      ? '<span class="source-thumb browser-thumb" aria-hidden="true">🌐</span>'
      : `<img src="${source.thumbnailDataUrl}" alt="" />`
    btn.innerHTML = `
      ${thumbHtml}
      <span>
        <strong>${escapeHtml(source.name)}</strong>
        <span>${source.type === 'browser' ? 'search tab' : source.type}</span>
      </span>
    `
    btn.addEventListener('click', () => {
      if (source.type === 'browser' || source.id === BROWSE_CAPTURE_SOURCE_ID) {
        void selectBrowseTabSource()
      } else {
        void selectDesktopSource(source)
      }
    })
    sourceList.appendChild(btn)
  }
}

async function selectDesktopSource(source: CaptureSource): Promise<void> {
  selectedSourceId = source.id
  captureKind = 'desktop'

  for (const el of sourceList.querySelectorAll('.source-card')) {
    el.classList.toggle('active', (el as HTMLElement).dataset.id === source.id)
  }

  stopStream(programStream)
  programStream = null

  try {
    const stream = await captureDesktopMedia(source)
    programStream = stream
    bindGameplayStream(stream)
    programVideo.srcObject = stream
    programEmpty.hidden = true
    layerGame.dataset.active = '1'
    layerGame.textContent = `Gameplay — ${source.name}`
    syncLayerTracks()
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
    captureKind = null
  }
}

async function captureDesktopMedia(source: CaptureSource): Promise<MediaStream> {
  if (source.type === 'screen') {
    try {
      return await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 },
        },
        audio: false,
      })
    } catch {
      // Fall through to desktopCapturer source id path.
    }
  }

  return navigator.mediaDevices.getUserMedia({
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
}

function bindGameplayStream(stream: MediaStream): void {
  for (const track of stream.getVideoTracks()) {
    track.onended = () => {
      if (programStream !== stream) return
      programVideo.srcObject = null
      programEmpty.hidden = false
      programEmpty.textContent = 'Capture source ended. Select a source again.'
      layerGame.dataset.active = '0'
      layerGame.textContent = 'Gameplay — none'
      programStream = null
      captureKind = null
      selectedSourceId = null
    }
  }
}

function bindBrowserStream(stream: MediaStream): void {
  for (const track of stream.getVideoTracks()) {
    track.onended = () => {
      if (browserStream !== stream) return
      void stopBrowserCapture()
    }
  }
}

async function stopBrowserCapture(): Promise<void> {
  stopStream(browserStream)
  browserStream = null
  programBrowserVideo.srcObject = null
  layerBrowser.dataset.active = '0'
  layerBrowser.textContent = 'Search tab — off'
  await window.tabcast.setBrowseCaptureActive(false)
  updateProgramBrowserOverlay()
  syncLayerTracks()
}

async function startBrowserCapture(): Promise<void> {
  layerEnabled.browser = true
  stopStream(browserStream)
  browserStream = null

  const target = await window.tabcast.getBrowseCaptureTarget()
  if (!target) {
    layerBrowser.dataset.active = '0'
    layerBrowser.textContent = 'Search tab — no tab'
    setDestError('Open a page in the Search tab, then enable the Search tab layer.')
    layerEnabled.browser = false
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: target.mediaSourceId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30,
        },
      } as MediaTrackConstraints,
    })
    browserStream = stream
    bindBrowserStream(stream)
    layerBrowser.dataset.active = '1'
    layerBrowser.textContent = `Search tab — ${target.title}`
    syncLayerTracks()
    setDestError(null)
  } catch (err) {
    await stopBrowserCapture()
    layerEnabled.browser = false
    setDestError(err instanceof Error ? err.message : 'Could not capture Search tab')
  }
}

async function selectBrowseTabSource(): Promise<void> {
  selectedSourceId = BROWSE_CAPTURE_SOURCE_ID
  captureKind = 'browse'

  for (const el of sourceList.querySelectorAll('.source-card')) {
    el.classList.toggle(
      'active',
      (el as HTMLElement).dataset.id === BROWSE_CAPTURE_SOURCE_ID,
    )
  }

  if (!programStream) {
    programEmpty.hidden = false
    programEmpty.textContent = 'Select gameplay (display/window) first, or use the Search tab layer for overlay only.'
  }

  layerEnabled.browser = true
  await startBrowserCapture()

  if (browserStream && currentMode !== 'studio') {
    await window.tabcast.setMode('studio')
  }
}

async function refreshSources(): Promise<void> {
  try {
    const sources = await window.tabcast.listCaptureSources()
    renderSources(sources)
  } catch (err) {
    sourceList.innerHTML = `<p class="hint">${escapeHtml(err instanceof Error ? err.message : 'Could not list sources')}</p>`
  }
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

  const snap = getPhoneTracksSnapshot()
  if (phoneHasVideoTrack(snap)) {
    const phoneCam = document.createElement('option')
    phoneCam.value = PHONE_CAMERA_DEVICE_VALUE
    phoneCam.textContent = 'Phone'
    cameraSelect.appendChild(phoneCam)
  }
  if (phoneHasAudioTrack(snap)) {
    const phoneMic = document.createElement('option')
    phoneMic.value = PHONE_MIC_DEVICE_VALUE
    phoneMic.textContent = 'Phone'
    micSelect.appendChild(phoneMic)
  }

  if ([...cameraSelect.options].some((o) => o.value === camValue)) cameraSelect.value = camValue
  if ([...micSelect.options].some((o) => o.value === micValue)) micSelect.value = micValue
}

function syncWhipAvTracks(): void {
  if (!whipPublisher) return
  const pc = whipPublisher.pc
  const gameplayIds = new Set(programStream?.getVideoTracks().map((t) => t.id) ?? [])
  const browserIds = new Set(browserStream?.getVideoTracks().map((t) => t.id) ?? [])

  let webcamSender: RTCRtpSender | null = null
  let micSender: RTCRtpSender | null = null
  for (const sender of pc.getSenders()) {
    const track = sender.track
    if (!track) continue
    if (track.kind === 'video' && !gameplayIds.has(track.id) && !browserIds.has(track.id)) {
      webcamSender = sender
    }
    if (track.kind === 'audio') micSender = sender
  }

  const nextWebcam =
    layerEnabled.cam && cameraStream
      ? cameraStream.getVideoTracks().find((t) => t.readyState === 'live') ?? null
      : null
  const nextMic =
    layerEnabled.mic && micStream
      ? micStream.getAudioTracks().find((t) => t.readyState === 'live') ?? null
      : null

  if (webcamSender) void webcamSender.replaceTrack(nextWebcam).catch(() => undefined)
  if (micSender) void micSender.replaceTrack(nextMic).catch(() => undefined)
}

async function handlePhoneVideoAvailable(): Promise<void> {
  const camBefore = cameraSelect.value
  if (camBefore && camBefore !== PHONE_CAMERA_DEVICE_VALUE) {
    pcCameraBeforePhone = camBefore
  }

  await refreshAvDevices()

  const shouldUsePhone =
    preferPhoneCamera ||
    camBefore === PHONE_CAMERA_DEVICE_VALUE ||
    !camBefore

  if (shouldUsePhone) {
    preferPhoneCamera = true
    cameraSelect.value = PHONE_CAMERA_DEVICE_VALUE
    lastCameraSelectValue = PHONE_CAMERA_DEVICE_VALUE
    await applyCamera()
  }
}

async function handlePhoneAudioAvailable(): Promise<void> {
  const micBefore = micSelect.value
  if (micBefore && micBefore !== PHONE_MIC_DEVICE_VALUE) {
    pcMicBeforePhone = micBefore
  }

  await refreshAvDevices()
}

async function handlePhoneVideoLost(): Promise<void> {
  const onPhoneCam = cameraSelect.value === PHONE_CAMERA_DEVICE_VALUE

  await refreshAvDevices()

  if (!onPhoneCam) {
    if (preferPhoneCamera) {
      await applyCamera()
      syncWhipAvTracks()
    }
    return
  }

  const restore = pcCameraBeforePhone
  const canRestore =
    Boolean(restore) && [...cameraSelect.options].some((o) => o.value === restore)

  if (canRestore) {
    preferPhoneCamera = false
    cameraSelect.value = restore
  } else {
    preferPhoneCamera = true
    const phoneInList = [...cameraSelect.options].some(
      (o) => o.value === PHONE_CAMERA_DEVICE_VALUE,
    )
    cameraSelect.value = phoneInList ? PHONE_CAMERA_DEVICE_VALUE : ''
  }

  lastCameraSelectValue = cameraSelect.value
  if (cameraSelect.value) {
    await applyCamera()
  } else {
    showWebcamOfflineIdle()
  }
  syncWhipAvTracks()
  if (isSessionLive()) void pushSceneLayout()
}

async function handlePhoneAudioLost(): Promise<void> {
  const onPhoneMic = micSelect.value === PHONE_MIC_DEVICE_VALUE

  await refreshAvDevices()

  if (!onPhoneMic) return

  const restore = pcMicBeforePhone
  micSelect.value =
    restore && [...micSelect.options].some((o) => o.value === restore) ? restore : ''
  lastMicSelectValue = micSelect.value
  await applyMic()
  syncWhipAvTracks()
  if (isSessionLive()) void pushSceneLayout()
}

function bindCameraStream(stream: MediaStream): void {
  for (const track of stream.getVideoTracks()) {
    track.onended = () => {
      if (cameraStream !== stream) return
      void handleCameraTrackLost()
    }
  }
}

function bindMicStream(stream: MediaStream): void {
  for (const track of stream.getAudioTracks()) {
    track.onended = () => {
      if (micStream !== stream) return
      void handleMicTrackLost()
    }
  }
}

async function handleCameraTrackLost(): Promise<void> {
  const onPhoneCam = cameraSelect.value === PHONE_CAMERA_DEVICE_VALUE
  releaseCameraStream()
  await refreshAvDevices().catch(() => undefined)

  if (onPhoneCam) {
    await handlePhoneVideoLost()
    return
  }

  const restore = pcCameraBeforePhone
  if (restore && [...cameraSelect.options].some((o) => o.value === restore)) {
    cameraSelect.value = restore
    lastCameraSelectValue = restore
    await applyCamera()
  } else {
    cameraSelect.value = ''
    lastCameraSelectValue = ''
    showWebcamOfflineIdle()
  }
  syncWhipAvTracks()
  if (isSessionLive()) void pushSceneLayout()
}

async function handleMicTrackLost(): Promise<void> {
  const onPhoneMic = micSelect.value === PHONE_MIC_DEVICE_VALUE
  releaseMicStream()
  await refreshAvDevices().catch(() => undefined)

  if (onPhoneMic) {
    await handlePhoneAudioLost()
    return
  }

  const restore = pcMicBeforePhone
  micSelect.value =
    restore && [...micSelect.options].some((o) => o.value === restore) ? restore : ''
  lastMicSelectValue = micSelect.value
  if (micSelect.value) {
    await applyMic()
  } else {
    layerMic.dataset.active = '0'
    layerMic.textContent = 'Mic — off'
    syncLayerTracks()
    syncWhipAvTracks()
  }
}

function finishCameraApply(label: string): void {
  layerCam.dataset.active = '1'
  layerEnabled.cam = true
  syncLayerTracks()
  syncWebcamPresentation(label)
  void pushSceneLayout()
  syncWhipAvTracks()
}

function showWebcamOfflineIdle(): void {
  layerCam.dataset.active = layerEnabled.cam ? '1' : '0'
  layerCam.textContent = layerEnabled.cam ? 'Webcam — offline' : 'Webcam — off'
  syncLayerTracks()
  syncWebcamPresentation()
  void pushSceneLayout()
  syncWhipAvTracks()
}

async function applyCamera(): Promise<void> {
  releaseCameraStream()
  cameraStream = null

  const deviceId = cameraSelect.value
  if (!deviceId) {
    preferPhoneCamera = false
    showWebcamOfflineIdle()
    return
  }

  if (deviceId === PHONE_CAMERA_DEVICE_VALUE) {
    preferPhoneCamera = true
    const phoneVideo = getPhoneTracksSnapshot().videoTrack
    if (!phoneVideo || phoneVideo.readyState !== 'live') {
      showWebcamOfflineIdle()
      return
    }
    cameraStream = new MediaStream([phoneVideo])
    finishCameraApply('Webcam — Phone')
    return
  }

  preferPhoneCamera = false
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
    })
    cameraStream = stream
    finishCameraApply(
      `Webcam — ${cameraSelect.selectedOptions[0]?.textContent ?? 'on'}`,
    )
  } catch {
    showWebcamOfflineIdle()
  }
}

async function applyMic(): Promise<void> {
  releaseMicStream()
  stopMicMeter()
  layerMic.dataset.active = '0'
  layerMic.textContent = 'Mic — off'
  micMuted = false

  const deviceId = micSelect.value
  if (!deviceId) return

  try {
    if (deviceId === PHONE_MIC_DEVICE_VALUE) {
      const phoneAudio = getPhoneTracksSnapshot().audioTrack
      if (!phoneAudio || phoneAudio.readyState !== 'live') {
        throw new Error('Phone microphone not available')
      }
      micStream = new MediaStream([phoneAudio])
      bindMicStream(micStream)
      layerMic.dataset.active = '1'
      layerMic.textContent = 'Mic — Phone'
      startMicMeter(micStream)
      syncLayerTracks()
      syncWhipAvTracks()
      return
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
      video: false,
    })
    micStream = stream
    bindMicStream(stream)
    layerMic.dataset.active = '1'
    layerMic.textContent = `Mic — ${micSelect.selectedOptions[0]?.textContent ?? 'on'}`
    startMicMeter(stream)
    syncLayerTracks()
    syncWhipAvTracks()
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

async function dispatchAddonLiveEvents(
  event: 'live.start' | 'live.end',
): Promise<void> {
  try {
    const results = await window.tabcast.dispatchAddonLiveEvent(event, {
      profile: selectedProfile(),
      platforms: {
        twitch: destTwitch.checked,
        youtube: destYoutube.checked,
        custom: destCustom.checked,
      },
    })
    const notable = results.filter((r) => r.message && r.message !== 'No webhook configured — skipped')
    if (notable.length) {
      const summary = notable.map((r) => r.message).filter(Boolean).join(' · ')
      if (summary) {
        destHint.textContent = summary
      }
    }
  } catch {
    // Non-fatal — addons must not block go-live
  }
}

function mountRetryConnectionHint(fatal: boolean): void {
  destHint.replaceChildren()
  if (fatal) {
    destHint.append('Ingest rejected — auto-retry stopped. ')
  } else {
    destHint.append(`Reconnect failed after ${MAX_LIVE_RETRY_ATTEMPTS} attempts. `)
  }
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.className = 'hint-action'
  retry.textContent = 'Retry connection'
  retry.addEventListener('click', () => {
    if (!sessionLiveIntent) return
    liveRecoveryExhausted = false
    liveRecoveryFatal = false
    liveRecoveryAttempts = 0
    liveRecoveryReason = 'manual-retry'
    setDestError(null)
    void runLiveRecovery('manual-retry')
  })
  destHint.append(retry)
  destHint.append(' or End Live to stop.')
}

async function endLive(): Promise<void> {
  goingLive = true
  btnGoLive.disabled = true
  btnGoLive.textContent = 'Ending…'
  setDestError(null)
  sessionLiveIntent = false
  stopWhipVideoWatchdog()
  cancelLiveRecovery()
  liveRecoveryAttempts = 0
  liveRecoveryExhausted = false
  liveRecoveryFatal = false
  liveRecoveryReason = null
  sessionIngestTarget = 'primary'

  try {
    if (whipPublisher) {
      await whipPublisher.close()
      whipPublisher = null
    }
    const snapshot = await window.tabcast.getRelay()
    await stopRelayStream(snapshot.health)
    await window.tabcast.refreshRelay()
    await dispatchAddonLiveEvents('live.end')
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
      throw new Error('Select a display or window for gameplay first.')
    }

    const twitch = destTwitch.checked ? twitchKey.value : ''
    const youtube = destYoutube.checked ? youtubeKey.value : ''
    const customUrl = destCustom.checked ? customRtmpUrl.value.trim() : ''
    const customKey = destCustom.checked ? customRtmpKey.value.trim() : ''
    if (!labMode) {
      const keysOk = validateRelayStreamKeys({
        twitchKey: twitch,
        youtubeKey: youtube,
        customRtmpUrl: customUrl,
        customRtmpKey: customKey,
        customEnabled: destCustom.checked,
      })
      if (!keysOk.ok) throw new Error(keysOk.message)
    } else if (!twitch && !youtube && !(destCustom.checked && customUrl && customKey)) {
      throw new Error('Demo mode still needs a placeholder key in at least one destination.')
    }

    if (destCustom.checked && customUrl && customKey) {
      await persistCustomRtmpSettings()
    }

    let snapshot = await window.tabcast.getRelay()
    if (snapshot.lifecycle === 'stopped' || snapshot.lifecycle === 'error') {
      snapshot = await window.tabcast.startRelay()
    }
    if (!snapshot.health) {
      throw new Error(snapshot.error ?? 'Relay is not ready. Start the relay first.')
    }

    const profile = selectedProfile()
    sessionIngestTarget = 'primary'
    await postRelayConfig(snapshot.health, relayConfigForIngest('primary'))

    await postSceneLayout(
      snapshot.health,
      defaultSceneLayout({
        profile,
        hasWebcam: hasLiveWebcamVideo() && layerEnabled.cam,
        hasBrowser: Boolean(browserStream) && layerEnabled.browser,
      }),
    )
    await pushSceneLayout()

    destHint.textContent = 'Publishing WHIP to local relay…'
    liveRecoveryAttempts = 0
    liveRecoveryExhausted = false
    liveRecoveryReason = null
    sessionLiveIntent = true

    whipPublisher = await attachWhipPublisher(snapshot.health)
    await window.tabcast.refreshRelay()
    await dispatchAddonLiveEvents('live.start')
    destHint.textContent = 'Live — keys stay in relay RAM. End Live to tear down WHIP.'
    btnGoLive.dataset.live = '1'
    btnGoLive.textContent = 'End Live'
  } catch (err) {
    sessionLiveIntent = false
    setDestError(err instanceof Error ? err.message : String(err))
    stopWhipVideoWatchdog()
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
  if (isSessionLive()) {
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
    const customUrl = destCustom.checked ? customRtmpUrl.value.trim() : ''
    const customKey = destCustom.checked ? customRtmpKey.value.trim() : ''
    const keysOk = validateRelayStreamKeys({
      twitchKey: twitch,
      youtubeKey: youtube,
      customRtmpUrl: customUrl,
      customRtmpKey: customKey,
      customEnabled: destCustom.checked,
    })
    if (!keysOk.ok) throw new Error(keysOk.message)

    let snapshot = await window.tabcast.getRelay()
    if (!snapshot.health) {
      snapshot = await window.tabcast.startRelay()
    }
    if (!snapshot.health) {
      throw new Error(snapshot.error ?? 'Relay is not ready.')
    }

    await postRelayConfig(snapshot.health, relayConfigForIngest('primary'))

    const result = await verifyRelayConfig(snapshot.health)
    if (!result.ok) {
      const parts = [
        result.message,
        result.twitch && !result.twitch.ok ? `Twitch: ${result.twitch.message ?? 'failed'}` : null,
        result.youtube && !result.youtube.ok
          ? `YouTube: ${result.youtube.message ?? 'failed'}`
          : null,
        result.custom && !result.custom.ok
          ? `Custom RTMP: ${result.custom.message ?? 'failed'}`
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
document.getElementById('btn-capture-browse')!.addEventListener('click', () => {
  void selectBrowseTabSource()
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
document.getElementById('btn-pin-yt-chat')!.addEventListener('click', () => {
  void window.tabcast.openPinned('pin-yt-chat').then(renderBrowseTabs)
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
  ;(document.getElementById('set-open-chat') as HTMLInputElement).checked = s.openChatOnBrowse
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
      openChatOnBrowse: (document.getElementById('set-open-chat') as HTMLInputElement).checked,
      labMode: (document.getElementById('set-lab-mode') as HTMLInputElement).checked,
      startupMode: (document.getElementById('set-startup') as HTMLSelectElement).value as AppMode,
    })
    labMode = next.labMode
    destHint.textContent = labMode
      ? 'Demo mode on — key format checks skipped (for testing and walkthroughs).'
      : 'Keys stay in relay RAM only. Go Live publishes WHIP to localhost.'
  }
})
camScale.addEventListener('input', () => {
  updateProgramCamOverlay()
})
camScale.addEventListener('change', () => {
  updateProgramCamOverlay()
  void pushSceneLayout()
})
for (const [el, key] of [
  [layerGame, 'game'],
  [layerCam, 'cam'],
  [layerMic, 'mic'],
  [layerBrowser, 'browser'],
] as const) {
  el.addEventListener('click', () => {
    if (key === 'browser') {
      layerEnabled.browser = !layerEnabled.browser
      if (layerEnabled.browser && !browserStream) {
        void startBrowserCapture()
        return
      }
      if (!layerEnabled.browser) {
        void stopBrowserCapture()
      }
    } else {
      layerEnabled[key] = !layerEnabled[key]
    }
    syncLayerTracks()
    void pushSceneLayout()
  })
}

async function renderAddonPanels(): Promise<void> {
  const panels = await window.tabcast.listAddonPanels()
  const preloadPath = await window.tabcast.getAddonPreloadPath()
  const hasCustomRtmp = panels.some((p) => p.addonId === CUSTOM_RTM_ADDON_ID)
  syncCustomRtmpBlock(hasCustomRtmp)
  if (hasCustomRtmp) {
    await loadCustomRtmpSettings()
    syncDestinationInputs()
  }

  addonPanels.innerHTML = ''
  if (!panels.length) {
    addonPanels.innerHTML = '<p class="hint">No addons loaded.</p>'
    return
  }

  for (const panel of panels) {
    const section = document.createElement('section')
    section.className = 'addon-panel'
    section.innerHTML = `<h3>${escapeHtml(panel.title)}</h3>`
    if (panel.description) {
      const p = document.createElement('p')
      p.className = 'hint tight'
      p.textContent = panel.description
      section.appendChild(p)
    }

    if (panel.runtimeUrl) {
      const webview = document.createElement('webview') as HTMLElement & {
        src: string
        preload: string
        partition: string
        className: string
      }
      webview.className = 'addon-webview'
      webview.src = panel.runtimeUrl
      if (preloadPath) webview.preload = preloadPath
      webview.partition = `persist:addon-${panel.addonId}`
      webview.setAttribute(
        'webpreferences',
        'contextIsolation=yes,nodeIntegration=no,sandbox=yes',
      )
      section.appendChild(webview)
    }

    if (panel.actions.length) {
      const list = document.createElement('div')
      list.className = 'addon-actions'
      for (const action of panel.actions) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.textContent = action.label
        if (action.description) btn.title = action.description
        btn.addEventListener('click', () => {
          void runAddonAction(panel.addonId, action.id)
        })
        list.appendChild(btn)
      }
      section.appendChild(list)
    }

    addonPanels.appendChild(section)
  }
}

async function runAddonAction(addonId: string, actionId: string): Promise<void> {
  if (addonId === 'com.tabcast.discord-now-live' && actionId === 'configure-webhook') {
    const url = window.prompt(
      'Discord channel webhook URL (https://discord.com/api/webhooks/…)',
      '',
    )
    if (!url?.trim()) return
    const res = await window.tabcast.setAddonSettings(addonId, { discordWebhookUrl: url.trim() })
    destHint.textContent = res.message ?? (res.ok ? 'Webhook saved.' : 'Save failed.')
    if (!res.ok) setDestError(res.message ?? 'Could not save webhook')
    return
  }

  if (addonId === CUSTOM_RTM_ADDON_ID && actionId === 'configure-kick') {
    customRtmpUrl.value = KICK_RTMP_URL
    destCustom.checked = true
    syncDestinationInputs()
    const res = await window.tabcast.setAddonSettings(addonId, { customRtmpUrl: KICK_RTMP_URL })
    destHint.textContent = res.ok
      ? 'Kick ingest URL set — paste your stream key in Destinations → Custom RTMP.'
      : (res.message ?? 'Could not save preset')
    return
  }

  if (addonId === CUSTOM_RTM_ADDON_ID && actionId === 'configure-rtmp') {
    const url = window.prompt('RTMP ingest URL (rtmps://…/app)', customRtmpUrl.value || KICK_RTMP_URL)
    if (!url?.trim()) return
    const key = window.prompt('Stream key')
    if (!key?.trim()) return
    customRtmpUrl.value = url.trim()
    customRtmpKey.value = key.trim()
    destCustom.checked = true
    syncDestinationInputs()
    const res = await window.tabcast.setAddonSettings(addonId, {
      customRtmpUrl: url.trim(),
      customRtmpKey: key.trim(),
    })
    destHint.textContent = res.message ?? (res.ok ? 'Custom RTMP saved.' : 'Save failed.')
    if (!res.ok) setDestError(res.message ?? 'Could not save RTMP settings')
    return
  }

  const snapshot = await window.tabcast.getRelay()
  const result = await window.tabcast.runAddonAction(addonId, actionId, {
    profile: selectedProfile(),
    hasWebcam: hasLiveWebcamVideo() && layerEnabled.cam,
  })
  if (!result.ok) {
    setDestError(result.message ?? 'Addon action failed')
    return
  }
  if (result.sceneLayout && snapshot.health) {
    await postSceneLayout(snapshot.health, result.sceneLayout as SceneLayout)
    destHint.textContent = result.message ?? 'Scene updated.'
    setDestError(null)
  } else if (result.message) {
    destHint.textContent = result.message
  }
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

profileSelect.addEventListener('change', () => {
  void window.tabcast.setSettings({ bitrateProfile: selectedProfile() })
})

async function teardownLiveSession(): Promise<void> {
  try {
    stopWhipVideoWatchdog()
    if (whipPublisher) {
      await whipPublisher.close().catch(() => undefined)
      whipPublisher = null
    }
    const snapshot = await window.tabcast.getRelay()
    if (snapshot.health && snapshot.lifecycle === 'live') {
      await stopRelayStream(snapshot.health).catch(() => undefined)
    }
    sessionLiveIntent = false
    cancelLiveRecovery()
    liveRecoveryAttempts = 0
    liveRecoveryExhausted = false
    stopStream(programStream)
    programStream = null
    captureKind = null
    await window.tabcast.setBrowseCaptureActive(false)
    stopStream(cameraStream)
    cameraStream = null
    stopStream(micStream)
    micStream = null
  } catch (err) {
    console.error('teardownLiveSession', err)
  }
}

window.tabcast.onPrepareQuit(() => {
  void teardownLiveSession().finally(() => {
    window.tabcast.ackPrepareQuit()
  })
})

window.tabcast.onTabs((tabs) => {
  renderBrowseTabs(tabs)
  void refreshSources()
})

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

let lastCameraSelectValue = cameraSelect.value
let lastMicSelectValue = micSelect.value

cameraSelect.addEventListener('change', () => {
  const prev = lastCameraSelectValue
  lastCameraSelectValue = cameraSelect.value
  if (
    prev &&
    prev !== PHONE_CAMERA_DEVICE_VALUE &&
    cameraSelect.value === PHONE_CAMERA_DEVICE_VALUE
  ) {
    pcCameraBeforePhone = prev
  }
  if (cameraSelect.value === PHONE_CAMERA_DEVICE_VALUE) {
    preferPhoneCamera = true
  } else if (cameraSelect.value) {
    preferPhoneCamera = false
  }
  void applyCamera()
})
micSelect.addEventListener('change', () => {
  const prev = lastMicSelectValue
  lastMicSelectValue = micSelect.value
  if (
    prev &&
    prev !== PHONE_MIC_DEVICE_VALUE &&
    micSelect.value === PHONE_MIC_DEVICE_VALUE
  ) {
    pcMicBeforePhone = prev
  }
  void applyMic()
})
destTwitch.addEventListener('change', () => {
  syncDestinationInputs()
  void window.tabcast.getRelay().then(renderPlatformStatus)
})
destYoutube.addEventListener('change', () => {
  syncDestinationInputs()
  void window.tabcast.getRelay().then(renderPlatformStatus)
})
destCustom.addEventListener('change', () => {
  syncDestinationInputs()
  void window.tabcast.getRelay().then(renderPlatformStatus)
})
twitchKey.addEventListener('input', () => {
  void window.tabcast.getRelay().then(renderPlatformStatus)
})
youtubeKey.addEventListener('input', () => {
  void window.tabcast.getRelay().then(renderPlatformStatus)
})
customRtmpKey.addEventListener('input', () => {
  void window.tabcast.getRelay().then(renderPlatformStatus)
})

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
  if (currentMode !== 'browse') return
  document.title = title ? `${title} · Maka — Search` : 'Maka — Search'
})

syncDestinationInputs()
void window.tabcast.getMode().then(applyMode)
void window.tabcast.getRelay().then(renderRelay)
window.tabcast.onRelayUpdate(handleRelayLiveRecovery)
void window.tabcast.getBrowserState().then((state) => {
  if (state) urlInput.value = state.url
})
void refreshSources()
void refreshAvDevices().then(() => {
  showWebcamOfflineIdle()
})
void renderAddonPanels()

initPhoneTracks(window.tabcast)
subscribePhoneTracks((snap) => {
  const hasVideo = phoneHasVideoTrack(snap)
  const hasAudio = phoneHasAudioTrack(snap)

  if (hasVideo && !phoneVideoWasLive) void handlePhoneVideoAvailable()
  else if (!hasVideo && phoneVideoWasLive) void handlePhoneVideoLost()

  if (hasAudio && !phoneAudioWasLive) void handlePhoneAudioAvailable()
  else if (!hasAudio && phoneAudioWasLive) void handlePhoneAudioLost()

  if (hasVideo || hasAudio) void refreshAvDevices()

  phoneVideoWasLive = hasVideo
  phoneAudioWasLive = hasAudio
})

window.tabcast.onAddonStudioToast((message) => {
  setDestError(null)
  destHint.textContent = message
})

initMarketplace(window.tabcast, {
  dialog: document.getElementById('marketplace-dialog') as HTMLDialogElement,
  list: document.getElementById('marketplace-list')!,
  onRefreshPanels: () => {
    void renderAddonPanels()
  },
  onToast: (message, isError) => {
    if (isError) setDestError(message)
    else {
      setDestError(null)
      destHint.textContent = message
    }
  },
})

const onboardingTour = new OnboardingTour(
  document.getElementById('onboarding-root')!,
  document.getElementById('onboarding-spotlight')!,
  document.querySelector('.onboarding-card')!,
  document.getElementById('onboarding-step')!,
  document.getElementById('onboarding-title')!,
  document.getElementById('onboarding-body')!,
  document.getElementById('onboarding-prev') as HTMLButtonElement,
  document.getElementById('onboarding-next') as HTMLButtonElement,
  document.getElementById('onboarding-skip') as HTMLButtonElement,
  {
    onComplete: () => {
      void window.tabcast.setSettings({ onboardingComplete: true })
    },
    onSkip: () => {
      void window.tabcast.setSettings({ onboardingComplete: true })
    },
  },
)

const setupWizard = new SetupWizard(
  document.getElementById('setup-wizard-root')!,
  document.getElementById('setup-wizard-step')!,
  document.getElementById('setup-wizard-title')!,
  document.getElementById('setup-wizard-body')!,
  document.getElementById('setup-wizard-status')!,
  document.getElementById('setup-wizard-keys')!,
  document.getElementById('setup-twitch-key') as HTMLInputElement,
  document.getElementById('setup-youtube-key') as HTMLInputElement,
  document.getElementById('setup-wizard-prev') as HTMLButtonElement,
  document.getElementById('setup-wizard-next') as HTMLButtonElement,
  document.getElementById('setup-wizard-skip') as HTMLButtonElement,
  {
    onComplete: () => {
      const setupTwitch = document.getElementById('setup-twitch-key') as HTMLInputElement
      const setupYoutube = document.getElementById('setup-youtube-key') as HTMLInputElement
      if (setupTwitch.value.trim()) twitchKey.value = setupTwitch.value.trim()
      if (setupYoutube.value.trim()) youtubeKey.value = setupYoutube.value.trim()
      syncDestinationInputs()
      void window.tabcast.setSettings({ setupWizardComplete: true }).then((s) => {
        if (!s.onboardingComplete) {
          window.setTimeout(() => onboardingTour.start(), 400)
        }
      })
    },
    onSkip: () => {
      void window.tabcast.setSettings({ setupWizardComplete: true })
    },
  },
)

document.getElementById('btn-replay-tour')!.addEventListener('click', () => {
  settingsDialog.close()
  window.setTimeout(() => onboardingTour.start(), 200)
})

document.getElementById('btn-replay-setup')!.addEventListener('click', () => {
  settingsDialog.close()
  window.setTimeout(() => setupWizard.start(), 200)
})

document.getElementById('btn-check-updates')!.addEventListener('click', () => {
  void window.tabcast.checkForUpdates().then(renderUpdateBanner)
})

const updateBanner = document.getElementById('update-banner')!
const updateBannerText = document.getElementById('update-banner-text')!
const updateBannerAction = document.getElementById('update-banner-action') as HTMLButtonElement
const updateBannerDismiss = document.getElementById('update-banner-dismiss') as HTMLButtonElement

function renderUpdateBanner(status: import('../preload/index').UpdateStatus): void {
  const showBanner =
    status.state === 'checking' ||
    status.state === 'available' ||
    status.state === 'downloading' ||
    status.state === 'downloaded' ||
    status.state === 'error'

  if (!showBanner) {
    updateBanner.hidden = true
    updateBanner.classList.add('hidden')
    document.body.classList.remove('update-banner-visible')
    return
  }

  updateBanner.hidden = false
  updateBanner.classList.remove('hidden')
  document.body.classList.add('update-banner-visible')
  updateBannerAction.hidden = false
  updateBannerDismiss.hidden = false

  if (status.state === 'checking') {
    updateBannerText.textContent = 'Checking for updates…'
    updateBannerAction.hidden = true
  } else if (status.state === 'available') {
    updateBannerText.textContent = `Update available${status.version ? `: v${status.version}` : ''}`
    updateBannerAction.textContent = 'Download'
    updateBannerAction.disabled = false
  } else if (status.state === 'downloading') {
    const pct = status.progress != null ? `${Math.round(status.progress)}%` : '…'
    updateBannerText.textContent = `Downloading update ${pct}`
    updateBannerAction.hidden = true
  } else if (status.state === 'downloaded') {
    updateBannerText.textContent = `Update ready${status.version ? ` — v${status.version}` : ''}. Restart to install.`
    updateBannerAction.textContent = 'Restart now'
    updateBannerAction.hidden = false
    updateBannerAction.disabled = false
  } else if (status.state === 'error') {
    updateBannerText.textContent = status.message ?? 'Update check failed'
    updateBannerAction.hidden = true
  }
}

updateBannerAction.addEventListener('click', () => {
  void window.tabcast.getUpdateStatus().then(async (status) => {
    if (status.state === 'downloaded') {
      await window.tabcast.installUpdate()
      return
    }
    if (status.state === 'available') {
      await window.tabcast.downloadUpdate()
    }
  })
})

updateBannerDismiss.addEventListener('click', () => {
  updateBanner.hidden = true
  updateBanner.classList.add('hidden')
})

window.tabcast.onUpdateStatus(renderUpdateBanner)


void window.tabcast.getSettings().then((s) => {
  if (!s.setupWizardComplete) {
    window.setTimeout(() => setupWizard.start(), 600)
  } else if (!s.onboardingComplete) {
    window.setTimeout(() => onboardingTour.start(), 800)
  }
})
