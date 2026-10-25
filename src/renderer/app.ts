import type {
  AppMode,
  BrowseTabInfo,
  CaptureSource,
  DiagEvent,
  TabcastBridge,
} from '../preload/index'
import type { RelaySnapshot } from '../shared/relay-snapshot'
import type { StreamProfile, SceneLayout, RelayHealth } from '../shared/tabcast'
import {
  ENCODE_PROFILE_ORDER,
  canvasForEncodeProfile,
  encodeProfileSpec,
  formatAutoEncodeLabel,
  normalizeEncodeProfileId,
  type EncodeProfileId,
} from '../shared/stream-encode-profiles'
import {
  coerceCustomScenes,
  defaultCustomSceneName,
  isCustomSceneId,
  isDeskOnlyLikeScene,
  MAX_CUSTOM_SCENES,
  nextCustomSceneId,
  resolveSceneLayoutTemplateId,
  type CustomScene,
} from '../shared/custom-scenes'
import { isSceneStubId, SCENE_TEMPLATES, sceneStubPreset } from '../shared/scene-templates'
import {
  sceneImageMaskMode,
  sceneSupportsImageUpload,
  type SceneImageMaskMode,
} from '../shared/scene-images'
import {
  OVERLAY_LAYOUT_PRESETS,
  defaultChatOverlaySlot,
  defaultNotificationsOverlaySlot,
  overlayPresetById,
} from '../shared/overlay-layout-presets'
import { BROWSE_CAPTURE_SOURCE_ID } from '../shared/capture'
import {
  BACKUP_INGEST_STATUS,
  nextIngestTargetAfterFailedRecovery,
  resolveCustomRtmpForPost,
  type IngestTarget,
} from '../shared/ingest-failover'
import { validateRelayStreamKeys, KICK_RTMP_URL } from '../shared/stream-keys'
import type { StreamDestinationSettings } from '../shared/stream-destination-settings'
import { GoLiveWizard, type GoLiveWizardPlatform } from './go-live-wizard'
import {
  buildRecordingFileName,
  createProgramRecording,
  recordingFileExtension,
} from './program-recording'
import { createProgramOutputCompositor } from './program-output-compositor'
import { createProgramVirtualCamera } from './program-virtual-camera'
import type { VcamCapability } from '../shared/virtual-camera'
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
import { startAudioLevelMeter, setHorizontalMeterLevel, type AudioLevelMeter } from './audio-level-meter'
import {
  parseCapturePlatform,
  startDesktopLoopbackAudio,
  startGameLinkedAudio,
  stopMediaStream,
  systemAudioCaptureSupported,
  type SystemAudioCapturePlatform,
} from './system-audio-capture'
import { OnboardingTour } from './onboarding'
import { SetupWizard } from './onboarding-wizard'
import { initMarketplace } from './marketplace'
import { initSettingsView } from './settings-view'
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
const programSceneCard = document.getElementById('program-scene-card')!
const programSceneCardTitle = document.getElementById('program-scene-card-title')!
const programSceneCardSubtitle = document.getElementById('program-scene-card-subtitle')!
const programSceneBg = document.getElementById('program-scene-bg') as HTMLImageElement
const sceneImagePanel = document.getElementById('scene-image-panel')!
const sceneImagePanelLabel = document.getElementById('scene-image-panel-label')!
const sceneImagePanelHint = document.getElementById('scene-image-panel-hint')!
const btnSceneImagePick = document.getElementById('btn-scene-image-pick') as HTMLButtonElement
const btnSceneImageClear = document.getElementById('btn-scene-image-clear') as HTMLButtonElement
const sceneImageMenuDialog = document.getElementById('scene-image-menu-dialog') as HTMLDialogElement
const sceneImageMenuPick = document.getElementById('scene-image-menu-pick') as HTMLButtonElement
const sceneImageMenuClear = document.getElementById('scene-image-menu-clear') as HTMLButtonElement
const sceneImageMenuCancel = document.getElementById('scene-image-menu-cancel') as HTMLButtonElement
const programCam = document.getElementById('program-cam')!
const programCamVideo = document.getElementById('program-cam-video') as HTMLVideoElement
const programCamOffline = document.getElementById('program-cam-offline')!
const cameraSelect = document.getElementById('camera-select') as HTMLSelectElement
const micSelect = document.getElementById('mic-select') as HTMLSelectElement
const programQualitySelect = document.getElementById(
  'program-quality-select',
) as HTMLSelectElement
const programOutputMode = document.getElementById('program-output-mode') as HTMLSelectElement
const platformKeyDialog = document.getElementById('platform-key-dialog') as HTMLDialogElement
const platformKeyForm = document.getElementById('platform-key-form') as HTMLFormElement
const platformKeyPanelTwitch = document.getElementById('platform-key-panel-twitch')!
const platformKeyPanelYoutube = document.getElementById('platform-key-panel-youtube')!
const platformKeyDialogTitle = document.getElementById('platform-key-dialog-title')!
const camScale = document.getElementById('cam-scale') as HTMLInputElement
const micMeter = document.getElementById('mic-meter')!
const desktopMeter = document.getElementById('desktop-meter')!
const gameMeter = document.getElementById('game-meter')!
const audioDesktopChannel = document.getElementById('audio-desktop')!
const audioGameChannel = document.getElementById('audio-game')!
const audioDesktopLabel = document.getElementById('audio-desktop-label')!
const audioGameLabel = document.getElementById('audio-game-label')!
const desktopAudioOutputSelect = document.getElementById(
  'desktop-audio-output',
) as HTMLSelectElement
const btnDesktopAudioSettings = document.getElementById(
  'btn-desktop-audio-settings',
) as HTMLButtonElement
const btnGameAudioSettings = document.getElementById('btn-game-audio-settings') as HTMLButtonElement
const destTwitch = document.getElementById('dest-twitch') as HTMLInputElement
const destYoutube = document.getElementById('dest-youtube') as HTMLInputElement
const twitchKey = document.getElementById('twitch-key') as HTMLInputElement
const youtubeKey = document.getElementById('youtube-key') as HTMLInputElement
const destHint = document.getElementById('dest-hint')!
const destError = document.getElementById('dest-error')!
const ffmpegLog = document.getElementById('ffmpeg-log')!
const diagDrawer = document.getElementById('diag-drawer')!
const settingsViewRoot = document.getElementById('settings-view')!
const btnSettings = document.getElementById('btn-settings') as HTMLButtonElement
const btnGoLive = document.getElementById('btn-go-live') as HTMLButtonElement
const layerGame = document.getElementById('layer-game')!
const layerCam = document.getElementById('layer-cam')!
const layerMic = document.getElementById('layer-mic')!
const layerBrowser = document.getElementById('layer-browser')!
const toggleWebcam = document.getElementById('toggle-webcam') as HTMLButtonElement
const toggleMic = document.getElementById('toggle-mic') as HTMLButtonElement
const toggleWebcamState = document.getElementById('toggle-webcam-state')!
const toggleMicState = document.getElementById('toggle-mic-state')!
const studioSourceGame = document.getElementById('studio-source-game')!
const studioSourceWebcam = document.getElementById('studio-source-webcam')!
const studioSourceMic = document.getElementById('studio-source-mic')!
const studioSourceBrowser = document.getElementById('studio-source-browser')!
const studioSourceChat = document.getElementById('studio-source-chat')!
const studioSourceNotifications = document.getElementById('studio-source-notifications')!
const studioStatusDot = document.getElementById('studio-status-dot')!
const studioStatusText = document.getElementById('studio-status-text')!
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
const programChatSlot = document.getElementById('program-chat-slot')!
const programNotificationsSlot = document.getElementById('program-notifications-slot')!
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
let desktopAudioStream: MediaStream | null = null
let gameAudioStream: MediaStream | null = null
let desktopMeterHandle: AudioLevelMeter | null = null
let gameMeterHandle: AudioLevelMeter | null = null
let desktopAudioMuted = false
let gameAudioMuted = false
let desktopAudioStarting = false
let capturePlatform: SystemAudioCapturePlatform = 'other'
let preferredDesktopOutputDeviceId = ''
let currentMode: AppMode = 'studio'
let whipPublisher: WhipPublisher | null = null
let whipVideoWatchdog: WhipVideoWatchdog | null = null
let goingLive = false
let micMuted = false
let labMode = false
let recordingSaveFolder = ''
let lastStreamPlatform: 'twitch' | 'youtube' | 'none' = 'none'
let pcCameraBeforePhone = ''
let pcMicBeforePhone = ''
let preferPhoneCamera = false
let phoneVideoWasLive = false
let phoneAudioWasLive = false
let sessionIngestTarget: IngestTarget = 'primary'
let micMeterHandle: AudioLevelMeter | null = null
const layerEnabled = {
  game: true,
  cam: true,
  mic: true,
  desktopAudio: true,
  gameAudio: true,
  browser: false,
  overlay: false,
  chat: false,
  notifications: false,
}

/** Chat picker selection: off, placeholder panel, or a Search tab / pinned preset id. */
let activeChatSourceId: 'off' | 'placeholder' | string = 'off'

let activeSceneTemplateId = 'gaming-cam'
const sceneImagePaths: Partial<Record<string, string>> = {}
const sceneImageDataUrlCache = new Map<string, string>()
let sceneImageMenuTargetId: string | null = null
let customScenes: CustomScene[] = []
const studioScenesList = document.getElementById('studio-scenes-list')!
const studioAddSceneRow = document.getElementById('studio-add-scene-row')!
/** Empty = follow the active scene template; set when user picks an overlay layout preset. */
let activeOverlayPresetId = ''

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
  const browseOpen = mode === 'browse'
  const settingsOpen = mode === 'settings'
  navrow.hidden = !browseOpen
  browsetabs.hidden = !browseOpen
  settingsViewRoot.hidden = !settingsOpen

  if (programOutputMode && (mode === 'studio' || mode === 'browse') && programOutputMode.value !== mode) {
    programOutputMode.value = mode
  }

  if (brandTag) {
    if (settingsOpen) {
      brandTag.textContent = 'Settings'
      brandTag.hidden = false
    } else {
      brandTag.textContent = browseOpen ? 'Browser Mode' : 'Streaming studio'
      brandTag.hidden = !browseOpen
    }
  }
  document.title = settingsOpen
    ? 'Maka — Settings'
    : browseOpen
      ? 'Maka — Browser'
      : 'Maka — Streaming'

  if (btnSettings) {
    btnSettings.setAttribute('aria-pressed', settingsOpen ? 'true' : 'false')
  }

  for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
    const active = tab.dataset.tab === 'studio' && mode === 'studio'
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
  micMeterHandle = startAudioLevelMeter(stream, setMicMeterLevel)
}

function stopMicMeter(): void {
  micMeterHandle?.stop()
  micMeterHandle = null
  setMicMeterLevel(0)
}

function setMicMeterLevel(percent: number): void {
  const level = Math.max(0, Math.min(100, percent))
  micMeter.style.width = `${level}%`
  micMeter.style.removeProperty('height')
}

function setDesktopMeterLevel(percent: number): void {
  setHorizontalMeterLevel(desktopMeter, percent)
}

function setGameMeterLevel(percent: number): void {
  setHorizontalMeterLevel(gameMeter, percent)
}

function syncSystemAudioChannelUi(): void {
  const supported = systemAudioCaptureSupported(capturePlatform)
  audioDesktopChannel.dataset.captureUnavailable = supported ? '0' : '1'
  audioGameChannel.dataset.captureUnavailable = supported ? '0' : '1'
  audioDesktopChannel.dataset.muted = desktopAudioMuted ? '1' : '0'
  audioGameChannel.dataset.muted = gameAudioMuted ? '1' : '0'
  btnDesktopAudioSettings.disabled = !supported
  btnGameAudioSettings.disabled = !supported

  if (!supported) {
    audioDesktopChannel.title = 'System audio capture requires Windows'
    audioGameChannel.title = 'System audio capture requires Windows'
    audioDesktopLabel.textContent = 'Desktop Audio'
    audioGameLabel.textContent = 'Game Audio'
    return
  }

  audioDesktopChannel.title = desktopAudioMuted
    ? 'Desktop audio muted for stream (click name to unmute)'
    : 'Full system loopback — click name to mute for stream'
  const gameLinked = Boolean(selectedSourceId) && captureKind === 'desktop'
  if (!gameLinked) {
    audioGameLabel.textContent = 'Game Audio'
    audioGameChannel.title = 'Select a display or window capture to link game audio'
  } else if (gameAudioMuted) {
    audioGameChannel.title = 'Game audio muted for stream (click name to unmute)'
    audioGameLabel.textContent = 'Game Audio'
  } else {
    audioGameChannel.title = 'Audio from gameplay capture — click name to mute for stream'
    audioGameLabel.textContent = 'Game Audio'
  }
}

function applyDesktopGameAudioTrackEnabled(): void {
  if (desktopAudioStream) {
    for (const track of desktopAudioStream.getAudioTracks()) {
      track.enabled = layerEnabled.desktopAudio && !desktopAudioMuted
    }
  }
  if (gameAudioStream) {
    for (const track of gameAudioStream.getAudioTracks()) {
      track.enabled = layerEnabled.gameAudio && !gameAudioMuted
    }
  }
}

function stopDesktopAudioMeter(): void {
  desktopMeterHandle?.stop()
  desktopMeterHandle = null
  setDesktopMeterLevel(0)
}

function stopGameAudioMeter(): void {
  gameMeterHandle?.stop()
  gameMeterHandle = null
  setGameMeterLevel(0)
}

function stopDesktopAudioCapture(): void {
  stopDesktopAudioMeter()
  stopMediaStream(desktopAudioStream)
  desktopAudioStream = null
}

function stopGameAudioCapture(): void {
  stopGameAudioMeter()
  stopMediaStream(gameAudioStream)
  gameAudioStream = null
}

async function refreshDesktopAudioCapture(): Promise<void> {
  if (!systemAudioCaptureSupported(capturePlatform)) {
    stopDesktopAudioCapture()
    syncSystemAudioChannelUi()
    return
  }
  if (desktopAudioStarting) return
  desktopAudioStarting = true
  stopDesktopAudioCapture()
  try {
    const stream = await startDesktopLoopbackAudio(preferredDesktopOutputDeviceId)
    if (!stream) {
      syncSystemAudioChannelUi()
      return
    }
    desktopAudioStream = stream
    applyDesktopGameAudioTrackEnabled()
    desktopMeterHandle = startAudioLevelMeter(stream, setDesktopMeterLevel)
    syncWhipAvTracks()
  } finally {
    desktopAudioStarting = false
    syncSystemAudioChannelUi()
  }
}

async function refreshGameAudioCapture(): Promise<void> {
  if (!systemAudioCaptureSupported(capturePlatform)) {
    stopGameAudioCapture()
    syncSystemAudioChannelUi()
    return
  }
  stopGameAudioCapture()
  const sourceId =
    captureKind === 'desktop' && selectedSourceId && selectedSourceId !== BROWSE_CAPTURE_SOURCE_ID
      ? selectedSourceId
      : null
  if (!sourceId) {
    syncSystemAudioChannelUi()
    syncWhipAvTracks()
    return
  }
  const stream = await startGameLinkedAudio(sourceId)
  if (!stream) {
    syncSystemAudioChannelUi()
    syncWhipAvTracks()
    return
  }
  gameAudioStream = stream
  applyDesktopGameAudioTrackEnabled()
  gameMeterHandle = startAudioLevelMeter(stream, setGameMeterLevel)
  syncWhipAvTracks()
  syncSystemAudioChannelUi()
}

async function refreshDesktopAudioOutputDevices(): Promise<void> {
  let devices: MediaDeviceInfo[] = []
  try {
    devices = await navigator.mediaDevices.enumerateDevices()
  } catch {
    devices = []
  }
  const outputs = devices.filter((d) => d.kind === 'audiooutput')
  const prev = desktopAudioOutputSelect.value
  desktopAudioOutputSelect.innerHTML = '<option value="">Default system output</option>'
  for (const out of outputs) {
    const opt = document.createElement('option')
    opt.value = out.deviceId
    opt.textContent = out.label || `Output ${desktopAudioOutputSelect.options.length}`
    desktopAudioOutputSelect.appendChild(opt)
  }
  const preferred = preferredDesktopOutputDeviceId
  if (preferred && [...desktopAudioOutputSelect.options].some((o) => o.value === preferred)) {
    desktopAudioOutputSelect.value = preferred
  } else if ([...desktopAudioOutputSelect.options].some((o) => o.value === prev)) {
    desktopAudioOutputSelect.value = prev
  }
}

async function initSystemAudioCapture(): Promise<void> {
  const info = await window.tabcast.getVersionInfo()
  capturePlatform = parseCapturePlatform(info.platform)
  syncSystemAudioChannelUi()
  if (!systemAudioCaptureSupported(capturePlatform)) {
    setDesktopMeterLevel(0)
    setGameMeterLevel(0)
    return
  }
  try {
    const s = await window.tabcast.getSettings()
    preferredDesktopOutputDeviceId = s.preferredDesktopAudioOutputDeviceId ?? ''
  } catch {
    // Non-fatal — default output device is fine.
  }
  await refreshDesktopAudioOutputDevices()
  await refreshDesktopAudioCapture()
  await refreshGameAudioCapture()
}

function whipLiveAudioTrack(
  stream: MediaStream | null,
  enabled: boolean,
): MediaStreamTrack | null {
  if (!stream || !enabled) return null
  return stream.getAudioTracks().find((t) => t.readyState === 'live') ?? null
}

function activeSceneImagePath(): string | undefined {
  if (!sceneSupportsImageUpload(activeSceneTemplateId)) return undefined
  return sceneImagePaths[activeSceneTemplateId]
}

function sceneImageMimeForPath(filePath: string): 'image/png' | 'image/jpeg' {
  return filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
}

function sceneImageRectForLayout(
  layout: SceneLayout,
  mode: SceneImageMaskMode,
): { x: number; y: number; width: number; height: number } {
  const { canvas, sources } = layout
  if (mode === 'game-mask-only') {
    const gameplay = sources.find((s) => s.id === 'gameplay')
    if (gameplay) {
      return {
        x: gameplay.x,
        y: gameplay.y,
        width: gameplay.width,
        height: gameplay.height,
      }
    }
  }
  return { x: 0, y: 0, width: canvas.width, height: canvas.height }
}

function hideProgramSceneBg(): void {
  programSceneBg.hidden = true
  programSceneBg.removeAttribute('src')
}

async function resolveSceneImageDataUrl(filePath: string): Promise<string | null> {
  const cached = sceneImageDataUrlCache.get(filePath)
  if (cached) return cached
  const dataUrl = await window.tabcast.readSceneImageDataUrl(filePath)
  if (dataUrl) sceneImageDataUrlCache.set(filePath, dataUrl)
  return dataUrl
}

async function refreshProgramSceneBgLayer(): Promise<void> {
  const mode = sceneImageMaskMode(activeSceneTemplateId)
  const path = activeSceneImagePath()
  if (!mode || !path) {
    hideProgramSceneBg()
    return
  }
  const dataUrl = await resolveSceneImageDataUrl(path)
  if (!dataUrl) {
    hideProgramSceneBg()
    return
  }
  const layout = buildOutgoingSceneLayout()
  const rect = sceneImageRectForLayout(layout, mode)
  applySourceBox(programSceneBg, { id: 'scene-image', type: 'overlay', ...rect, zIndex: 0 }, layout.canvas)
  programSceneBg.src = dataUrl
  programSceneBg.hidden = false
}

function syncSceneImagePanel(): void {
  if (!sceneSupportsImageUpload(activeSceneTemplateId)) {
    sceneImagePanel.hidden = true
    return
  }
  sceneImagePanel.hidden = false
  const sceneId = activeSceneTemplateId
  const path = sceneImagePaths[sceneId]
  btnSceneImageClear.hidden = !path
  const mode = sceneImageMaskMode(activeSceneTemplateId)
  if (mode === 'game-mask-only') {
    if (activeSceneTemplateId === 'desk-only') {
      sceneImagePanelLabel.textContent = 'Just Chatting image'
    } else if (isCustomSceneId(activeSceneTemplateId)) {
      const custom = customScenes.find((s) => s.id === activeSceneTemplateId)
      sceneImagePanelLabel.textContent = custom ? `${custom.name} image` : 'Scene image'
    } else {
      sceneImagePanelLabel.textContent = 'Scene image'
    }
    sceneImagePanelHint.textContent =
      'PNG/JPG replaces the gameplay layer only. Webcam stays above the image; chat and notification slots follow your overlay layout.'
  } else {
    sceneImagePanelLabel.textContent = 'Scene image'
    sceneImagePanelHint.textContent =
      'PNG/JPG covers the program area (game + webcam). Chat and notification regions stay visible when an overlay layout is active.'
  }
  if (path) {
    const name = path.split(/[/\\]/).pop() ?? path
    sceneImagePanelHint.textContent = `${sceneImagePanelHint.textContent} Current: ${name}`
  }
}

function syncSceneProgramPresentation(): void {
  const stub = isSceneStubId(activeSceneTemplateId)
  const preset = sceneStubPreset(activeSceneTemplateId)
  const hasSceneImage = Boolean(activeSceneImagePath())
  syncSceneImagePanel()

  if (stub && preset && !hasSceneImage) {
    programSceneCard.hidden = false
    programSceneCard.dataset.scene = activeSceneTemplateId
    programSceneCardTitle.textContent = preset.title
    programSceneCardSubtitle.textContent = preset.subtitle
    programVideo.hidden = true
    programCam.hidden = true
    programBrowser.hidden = true
    programChatSlot.hidden = true
    programNotificationsSlot.hidden = true
    programEmpty.hidden = true
    hideProgramSceneBg()
    return
  }

  programSceneCard.hidden = true
  programSceneCard.dataset.scene = ''

  if (stub && hasSceneImage) {
    programVideo.hidden = true
    programCam.hidden = true
    programBrowser.hidden = true
    programEmpty.hidden = true
    void refreshProgramSceneBgLayer()
    refreshProgramPreviewLayout()
    updateProgramBrowserOverlay()
    return
  }

  const showGameplay = Boolean(programStream) && layerEnabled.game && !hasSceneImage
  programVideo.hidden = !showGameplay
  programEmpty.hidden = showGameplay || hasSceneImage
  if (hasSceneImage) {
    void refreshProgramSceneBgLayer()
  } else {
    hideProgramSceneBg()
  }
  updateProgramCamOverlay()
  updateProgramBrowserOverlay()
}

function syncProgramVideoSurface(): void {
  syncSceneProgramPresentation()
}

function updateStudioMixControls(): void {
  const camOn = layerEnabled.cam
  toggleWebcam.dataset.on = camOn ? '1' : '0'
  toggleWebcam.setAttribute('aria-pressed', camOn ? 'true' : 'false')
  toggleWebcamState.textContent = camOn ? 'On' : 'Off'

  const micOn = layerEnabled.mic && Boolean(micStream)
  toggleMic.dataset.on = micOn && !micMuted ? '1' : '0'
  toggleMic.setAttribute('aria-pressed', micOn && !micMuted ? 'true' : 'false')
  if (!micStream) {
    toggleMicState.textContent = 'Off'
  } else if (micMuted) {
    toggleMicState.textContent = 'Muted'
  } else {
    toggleMicState.textContent = layerEnabled.mic ? 'On' : 'Off'
  }

  studioSourceGame.dataset.active = programStream ? '1' : '0'
  studioSourceGame.dataset.enabled = layerEnabled.game ? '1' : '0'
  studioSourceWebcam.dataset.active = hasLiveWebcamVideo() ? '1' : '0'
  studioSourceWebcam.dataset.enabled = layerEnabled.cam ? '1' : '0'
  studioSourceMic.dataset.active = micStream ? '1' : '0'
  studioSourceMic.dataset.enabled = layerEnabled.mic ? '1' : '0'
  const overlayActive = overlaySourceShowingInProgram()
  studioSourceBrowser.dataset.active = overlayActive ? '1' : '0'
  studioSourceBrowser.dataset.enabled = overlayActive ? '1' : '0'
  studioSourceChat.dataset.enabled = layerEnabled.chat ? '1' : '0'
  studioSourceChat.dataset.active = layerEnabled.chat ? '1' : '0'
  studioSourceNotifications.dataset.enabled = layerEnabled.notifications ? '1' : '0'
  studioSourceNotifications.dataset.active = layerEnabled.notifications ? '1' : '0'
  syncChatSourceRow()
}

function updateStudioStatusFooter(snapshot: RelaySnapshot): void {
  if (snapshot.lifecycle === 'error' || liveRecoveryExhausted) {
    studioStatusDot.dataset.state = 'bad'
    studioStatusText.textContent = 'Relay needs attention'
    return
  }
  if (snapshot.lifecycle === 'starting' || liveReconnecting) {
    studioStatusDot.dataset.state = 'warn'
    studioStatusText.textContent = 'Relay starting…'
    return
  }
  if (snapshot.lifecycle === 'stopped') {
    studioStatusDot.dataset.state = 'warn'
    studioStatusText.textContent = 'Relay offline — start when ready'
    return
  }
  studioStatusDot.dataset.state = 'ok'
  studioStatusText.textContent = 'All systems nominal'
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
  applyDesktopGameAudioTrackEnabled()
  layerGame.dataset.enabled = layerEnabled.game ? '1' : '0'
  layerCam.dataset.enabled = layerEnabled.cam ? '1' : '0'
  layerMic.dataset.enabled = layerEnabled.mic ? '1' : '0'
  layerBrowser.dataset.enabled = layerEnabled.browser ? '1' : '0'
  syncSceneProgramPresentation()
  refreshProgramPreviewLayout()
  updateStudioMixControls()
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

function usesOverlayPresetLayout(): boolean {
  return Boolean(
    activeOverlayPresetId && layerEnabled.overlay && overlayPresetById(activeOverlayPresetId),
  )
}

function syncWebcamPresentation(camLabel?: string): void {
  const layerOn = layerEnabled.cam
  const hasVideo = hasLiveWebcamVideo()

  if (!layerOn) {
    programCam.hidden = true
    programCamVideo.hidden = true
    programCamOffline.hidden = true
    programCamVideo.srcObject = null
    updateStudioMixControls()
    return
  }

  const layout = buildOutgoingSceneLayout()
  const webcam = layout.sources.find((s) => s.id === 'webcam')
  if (webcam) {
    applySourceBox(programCam, webcam, layout.canvas)
  } else if (!usesOverlayPresetLayout()) {
    programCam.style.left = ''
    programCam.style.top = ''
    programCam.style.height = ''
    const scale = Math.max(12, Math.min(40, Number(camScale.value) || 22))
    programCam.style.width = `${scale}%`
  }

  programCam.hidden = false
  if (hasVideo) {
    programCamVideo.hidden = false
    programCamOffline.hidden = true
    if (programCamVideo.srcObject !== cameraStream) {
      programCamVideo.srcObject = cameraStream
    }
    void programCamVideo.play().catch(() => undefined)
  } else {
    programCamVideo.hidden = true
    programCamOffline.hidden = false
    programCamOffline.textContent = WEBCAM_OFFLINE_TEXT
    programCamVideo.srcObject = null
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

function applySourceBox(
  el: HTMLElement,
  source: SceneLayout['sources'][number],
  canvas: { width: number; height: number },
): void {
  el.style.inset = 'auto'
  el.style.right = 'auto'
  el.style.bottom = 'auto'
  el.style.left = `${(source.x / canvas.width) * 100}%`
  el.style.top = `${(source.y / canvas.height) * 100}%`
  el.style.width = `${(source.width / canvas.width) * 100}%`
  el.style.height = `${(source.height / canvas.height) * 100}%`
  el.style.aspectRatio = 'auto'
}

function resetProgramGameplayBox(): void {
  programVideo.style.inset = '0'
  programVideo.style.left = ''
  programVideo.style.top = ''
  programVideo.style.width = '100%'
  programVideo.style.height = '100%'
}

function applyProgramPreviewLayout(layout: SceneLayout): void {
  const { canvas, sources } = layout
  const sourceById = (id: string) => sources.find((s) => s.id === id)

  const gameplay = sourceById('gameplay')
  if (gameplay && layerEnabled.game && programStream) {
    applySourceBox(programVideo, gameplay, canvas)
  } else if (programStream) {
    resetProgramGameplayBox()
  }

  const webcam = sourceById('webcam')
  if (webcam && layerEnabled.cam) {
    applySourceBox(programCam, webcam, canvas)
  } else if (!usesOverlayPresetLayout()) {
    programCam.style.left = ''
    programCam.style.top = ''
    programCam.style.width = ''
    programCam.style.height = ''
  } else if (usesOverlayPresetLayout()) {
    programCam.style.left = ''
    programCam.style.top = ''
    programCam.style.height = ''
  }

  const chat = sourceById('chat')
  const showChatPlaceholder =
    layerEnabled.chat && Boolean(chat) && !(browserStream && layerEnabled.browser)
  programChatSlot.hidden = !showChatPlaceholder
  if (showChatPlaceholder && chat) {
    applySourceBox(programChatSlot, chat, canvas)
  }

  const notifications = sourceById('notifications')
  const showNotifications = layerEnabled.notifications && Boolean(notifications)
  programNotificationsSlot.hidden = !showNotifications
  if (showNotifications && notifications) {
    applySourceBox(programNotificationsSlot, notifications, canvas)
  }

  if (browserStream && layerEnabled.browser) {
    const browserRect = sourceById('browser') ?? chat
    if (browserRect) {
      applySourceBox(programBrowser, browserRect, canvas)
    }
  }
}

function buildOutgoingSceneLayout(): SceneLayout {
  const profile = selectedProfile()
  const hasWebcam = hasLiveWebcamVideo() && layerEnabled.cam
  const hasBrowser = Boolean(browserStream) && layerEnabled.browser

  const preset =
    activeOverlayPresetId && layerEnabled.overlay
      ? overlayPresetById(activeOverlayPresetId)
      : undefined
  let layout: SceneLayout
  if (isSceneStubId(activeSceneTemplateId)) {
    const template = SCENE_TEMPLATES.find((t) => t.id === activeSceneTemplateId)
    layout = template
      ? template.build({ profile, hasWebcam: false })
      : { canvas: canvasForEncodeProfile(profile), sources: [] }
    if (preset) {
      const presetLayout = preset.build({ profile, hasWebcam: false })
      const overlaySlotIds = new Set(['chat', 'notifications', 'browser'])
      for (const source of presetLayout.sources) {
        if (overlaySlotIds.has(source.id)) {
          layout.sources.push({ ...source })
        }
      }
    }
  } else if (preset) {
    layout = preset.build({ profile, hasWebcam })
  } else {
    const layoutTemplateId = resolveSceneLayoutTemplateId(activeSceneTemplateId)
    const template = SCENE_TEMPLATES.find((t) => t.id === layoutTemplateId)
    layout = template
      ? template.build({ profile, hasWebcam })
      : defaultSceneLayout({
          profile,
          hasWebcam,
          hasBrowser,
        })
    const scale = Number(camScale.value) / 100
    const cam = layout.sources.find((s) => s.id === 'webcam')
    if (cam) {
      cam.width = Math.round(layout.canvas.width * scale)
      cam.height = Math.round(cam.width * (9 / 16))
      cam.x = layout.canvas.width - cam.width - 24
      cam.y = layout.canvas.height - cam.height - 24
    }
  }

  if (!layerEnabled.game) {
    layout.sources = layout.sources.filter((s) => s.id !== 'gameplay')
  }
  if (!hasWebcam) {
    layout.sources = layout.sources.filter((s) => s.id !== 'webcam')
  }
  if (!layerEnabled.browser) {
    layout.sources = layout.sources.filter((s) => s.id !== 'browser')
  }
  if (!layerEnabled.chat) {
    layout.sources = layout.sources.filter((s) => s.id !== 'chat')
  } else if (!layout.sources.some((s) => s.id === 'chat')) {
    layout.sources.push(defaultChatOverlaySlot(layout.canvas))
  }
  if (!layerEnabled.notifications) {
    layout.sources = layout.sources.filter((s) => s.id !== 'notifications')
  } else if (!layout.sources.some((s) => s.id === 'notifications')) {
    layout.sources.push(defaultNotificationsOverlaySlot(layout.canvas))
  }

  layout.sources = layout.sources.filter((s) => s.id !== 'scene-image')
  const imageMode = sceneImageMaskMode(activeSceneTemplateId)
  const imagePath =
    imageMode && sceneSupportsImageUpload(activeSceneTemplateId)
      ? sceneImagePaths[activeSceneTemplateId]
      : undefined
  if (imagePath && imageMode) {
    const rect = sceneImageRectForLayout(layout, imageMode)
    layout.sources.push({
      id: 'scene-image',
      type: 'overlay',
      label: 'Scene image',
      ...rect,
      zIndex: imageMode === 'game-mask-only' ? 0 : 1,
      assetPath: imagePath,
      assetMime: sceneImageMimeForPath(imagePath),
    })
  }

  if (hasBrowser && !layout.sources.some((s) => s.id === 'browser')) {
    const chat = layout.sources.find((s) => s.id === 'chat')
    if (chat) {
      layout.sources.push({
        id: 'browser',
        type: 'video',
        label: 'Search tab',
        x: chat.x,
        y: chat.y,
        width: chat.width,
        height: chat.height,
        zIndex: chat.zIndex + 1,
      })
    } else {
      const w = Math.round(layout.canvas.width * 0.35)
      const h = Math.round(w * (9 / 16))
      layout.sources.push({
        id: 'browser',
        type: 'video',
        label: 'Search tab',
        x: 24,
        y: 24,
        width: w,
        height: h,
        zIndex: 1,
      })
    }
  }
  return layout
}

function refreshProgramPreviewLayout(): void {
  const layout = buildOutgoingSceneLayout()
  applyProgramPreviewLayout(layout)
  if (activeSceneImagePath()) {
    void refreshProgramSceneBgLayer()
  }
}

function syncOverlaySourceRow(): void {
  const preset =
    activeOverlayPresetId && layerEnabled.overlay
      ? overlayPresetById(activeOverlayPresetId)
      : undefined
  const presetLabel = preset?.name ?? 'Scene layout'
  if (browserStream && layerEnabled.browser) {
    layerBrowser.dataset.active = '1'
    layerBrowser.textContent = `Overlay — ${presetLabel} · Search tab on`
  } else {
    layerBrowser.dataset.active = preset ? '1' : '0'
    layerBrowser.textContent = `Overlay — ${presetLabel}`
  }
}

async function selectOverlayPreset(id: string): Promise<void> {
  activeOverlayPresetId = id
  layerEnabled.overlay = true
  const preset = overlayPresetById(id)
  if (preset) {
    const preview = preset.build({
      profile: selectedProfile(),
      hasWebcam: hasLiveWebcamVideo() && layerEnabled.cam,
    })
    if (preview.sources.some((s) => s.id === 'chat')) {
      layerEnabled.chat = true
      if (activeChatSourceId === 'off') activeChatSourceId = 'placeholder'
    }
    if (preview.sources.some((s) => s.id === 'notifications')) {
      layerEnabled.notifications = true
    }
    syncChatSourceRow()
  }
  syncOverlaySourceRow()
  syncLayerTracks()
  if (expandedSourceKinds.has('browser')) {
    void refreshSourcePicker('browser')
  }
  void pushSceneLayout()
}

async function pushSceneLayout(): Promise<void> {
  const layout = buildOutgoingSceneLayout()
  applyProgramPreviewLayout(layout)
  const snapshot = await window.tabcast.getRelay()
  if (!snapshot.health) return
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

  updateStudioStatusFooter(snapshot)

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

  updateProgramStats(snapshot)
  updateGoLiveLabel(live)
  updateStreamInfo(live)
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
    if (!primaryVideoStreamForWhip()) {
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
    syncWhipAvTracks()
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

function primaryVideoStreamForWhip(): MediaStream | null {
  if (programStream) return programStream
  if (isDeskOnlyLikeScene(activeSceneTemplateId) && layerEnabled.cam && cameraStream) {
    return cameraStream
  }
  return null
}

function captureReadyForGoLive(): boolean {
  if (isSceneStubId(activeSceneTemplateId)) {
    return Boolean(primaryVideoStreamForWhip() || (layerEnabled.cam && cameraStream))
  }
  if (isDeskOnlyLikeScene(activeSceneTemplateId)) {
    return Boolean(primaryVideoStreamForWhip())
  }
  return Boolean(programStream)
}

function goLiveCaptureError(): string {
  if (isDeskOnlyLikeScene(activeSceneTemplateId)) {
    return 'Select a webcam (or gameplay source) before going live.'
  }
  if (isSceneStubId(activeSceneTemplateId)) {
    return 'Attach a capture source before going live on a holding scene.'
  }
  return 'Select a display or window for gameplay first.'
}

async function attachWhipPublisher(health: RelayHealth): Promise<WhipPublisher> {
  const gameplay = primaryVideoStreamForWhip()
  if (!gameplay) {
    throw new Error(goLiveCaptureError())
  }
  return publishWhip(
    whipUrlFromHealth(health),
    {
      gameplay,
      browser: layerEnabled.browser && browserStream ? browserStream : null,
      webcam: layerEnabled.cam ? cameraStream : null,
      mic: layerEnabled.mic ? micStream : null,
      desktopAudio: layerEnabled.desktopAudio ? desktopAudioStream : null,
      gameAudio: layerEnabled.gameAudio ? gameAudioStream : null,
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
  return normalizeEncodeProfileId(programQualitySelect.value)
}

function populateEncodeProfileSelect(select: HTMLSelectElement): void {
  select.innerHTML = ''
  for (const id of ENCODE_PROFILE_ORDER) {
    const option = document.createElement('option')
    option.value = id
    option.textContent = formatAutoEncodeLabel(id)
    select.appendChild(option)
  }
}

function syncEncodeProfileSelects(id: EncodeProfileId): void {
  if (programQualitySelect.value !== id) programQualitySelect.value = id
  const wizardQuality = document.getElementById('go-live-wizard-quality') as HTMLSelectElement | null
  if (wizardQuality && wizardQuality.value !== id) wizardQuality.value = id
}

function onEncodeProfileChanged(id: EncodeProfileId): void {
  syncEncodeProfileSelects(id)
  updateProgramStats()
  syncStreamInfoMeta()
  void window.tabcast.setSettings({ bitrateProfile: id })
  void pushSceneLayout().catch(() => undefined)
}

function initEncodeProfileControls(): void {
  populateEncodeProfileSelect(programQualitySelect)
  const initial = normalizeEncodeProfileId(programQualitySelect.value)
  syncEncodeProfileSelects(initial)
  updateProgramStats()
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

function streamDestinationsFromUi(): StreamDestinationSettings {
  return {
    destTwitch: destTwitch.checked,
    destYoutube: destYoutube.checked,
    destCustom: destCustom.checked,
    twitchKey: twitchKey.value,
    youtubeKey: youtubeKey.value,
  }
}

function applyStreamDestinations(saved: StreamDestinationSettings): void {
  destTwitch.checked = saved.destTwitch
  destYoutube.checked = saved.destYoutube
  destCustom.checked = saved.destCustom
  twitchKey.value = saved.twitchKey
  youtubeKey.value = saved.youtubeKey
  syncDestinationInputs()
  void window.tabcast.getRelay().then(renderPlatformStatus)
}

async function persistStreamDestinationsFromUi(): Promise<void> {
  await window.tabcast.setSettings({ streamDestinations: streamDestinationsFromUi() })
}

function syncDestinationInputs(): void {
  twitchKey.disabled = !destTwitch.checked
  youtubeKey.disabled = !destYoutube.checked
  const customEnabled = destCustom.checked
  customRtmpUrl.disabled = !customEnabled
  customRtmpKey.disabled = !customEnabled
  backupRtmpUrl.disabled = !customEnabled
  backupRtmpKey.disabled = !customEnabled
  syncStreamInfoMeta()
}

function applyWizardPlatform(platform: GoLiveWizardPlatform): void {
  destTwitch.checked = platform === 'twitch'
  destYoutube.checked = platform === 'youtube'
  destCustom.checked = platform === 'custom'
  syncDestinationInputs()
  if (platform === 'twitch' || platform === 'youtube') {
    lastStreamPlatform = platform
    void window.tabcast.setSettings({ lastStreamPlatform: platform })
  }
}

type PlatformKeyTarget = 'twitch' | 'youtube'

function openPlatformKeyDialog(platform: PlatformKeyTarget): void {
  platformKeyPanelTwitch.hidden = platform !== 'twitch'
  platformKeyPanelYoutube.hidden = platform !== 'youtube'
  platformKeyDialogTitle.textContent =
    platform === 'twitch' ? 'Twitch stream key' : 'YouTube stream key'
  syncDestinationInputs()
  platformKeyDialog.showModal()
  const input = platform === 'twitch' ? twitchKey : youtubeKey
  requestAnimationFrame(() => {
    if (!input.disabled) input.focus()
  })
}

function syncCustomRtmpBlock(show: boolean): void {
  destCustomBlock.hidden = !show
  platCustom.hidden = !show
  const wizardCustom = document.getElementById('go-live-wizard-custom-option')
  if (wizardCustom) wizardCustom.hidden = !show
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

type SourceKind = 'game' | 'webcam' | 'mic' | 'browser' | 'chat' | 'notifications'

const SOURCE_KINDS: SourceKind[] = ['game', 'webcam', 'mic', 'browser', 'chat', 'notifications']

const sourcePickerEls: Record<SourceKind, HTMLUListElement> = {
  game: document.getElementById('source-picker-game') as HTMLUListElement,
  webcam: document.getElementById('source-picker-webcam') as HTMLUListElement,
  mic: document.getElementById('source-picker-mic') as HTMLUListElement,
  browser: document.getElementById('source-picker-browser') as HTMLUListElement,
  chat: document.getElementById('source-picker-chat') as HTMLUListElement,
  notifications: document.getElementById('source-picker-notifications') as HTMLUListElement,
}

const expandedSourceKinds = new Set<SourceKind>()
let activeBrowseTabId: string | null = null

function sourceMenuEl(kind: SourceKind): HTMLElement | null {
  return sourceToggleEls[kind].querySelector<HTMLElement>('[data-source-menu]')
}

function syncSourcePickerVisibility(): void {
  for (const kind of SOURCE_KINDS) {
    const picker = sourcePickerEls[kind]
    const toggle = sourceToggleEls[kind]
    const menu = sourceMenuEl(kind)
    const open = expandedSourceKinds.has(kind)
    picker.hidden = !open
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    toggle.dataset.expanded = open ? '1' : '0'
    if (menu) {
      menu.setAttribute('aria-expanded', open ? 'true' : 'false')
    }
  }
}

function appendPickerSectionHeader(picker: HTMLUListElement, title: string): void {
  const li = document.createElement('li')
  li.className = 'studio-source-picker-section'
  const p = document.createElement('p')
  p.className = 'studio-source-picker-section-title'
  p.textContent = title
  li.appendChild(p)
  picker.appendChild(li)
}

function setPickerStatus(picker: HTMLUListElement, message: string): void {
  picker.innerHTML = ''
  const li = document.createElement('li')
  const p = document.createElement('p')
  p.className = 'studio-source-picker-status'
  p.textContent = message
  li.appendChild(p)
  picker.appendChild(li)
}

function appendPickerButton(
  picker: HTMLUListElement,
  opts: {
    label: string
    kindLabel?: string
    thumbnailDataUrl?: string
    active?: boolean
    onPick: () => void | Promise<void>
  },
): void {
  const li = document.createElement('li')
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'studio-source-picker-item'
  btn.dataset.active = opts.active ? '1' : '0'

  if (opts.thumbnailDataUrl) {
    const img = document.createElement('img')
    img.className = 'studio-source-picker-thumb'
    img.alt = ''
    img.src = opts.thumbnailDataUrl
    btn.appendChild(img)
  }

  const label = document.createElement('span')
  label.className = 'studio-source-picker-label'
  label.textContent = opts.label
  btn.appendChild(label)

  if (opts.kindLabel) {
    const kind = document.createElement('span')
    kind.className = 'studio-source-picker-kind'
    kind.textContent = opts.kindLabel
    btn.appendChild(kind)
  }

  btn.addEventListener('click', (event) => {
    event.stopPropagation()
    void opts.onPick()
  })
  li.appendChild(btn)
  picker.appendChild(li)
}

const sourceToggleEls: Record<SourceKind, HTMLButtonElement> = {
  game: studioSourceGame as HTMLButtonElement,
  webcam: studioSourceWebcam as HTMLButtonElement,
  mic: studioSourceMic as HTMLButtonElement,
  browser: studioSourceBrowser as HTMLButtonElement,
  chat: studioSourceChat as HTMLButtonElement,
  notifications: studioSourceNotifications as HTMLButtonElement,
}

const CHAT_PINNED_PRESETS: { id: string; label: string }[] = [
  { id: 'pin-chat', label: 'Twitch chat popout' },
  { id: 'pin-yt-chat', label: 'YouTube Live Chat' },
]

function isChatLikeTab(tab: BrowseTabInfo): boolean {
  const hay = `${tab.title} ${tab.url}`.toLowerCase()
  return (
    hay.includes('chat') ||
    hay.includes('popout') ||
    tab.id === 'pin-chat' ||
    tab.id === 'pin-yt-chat'
  )
}

function syncChatSourceRow(): void {
  if (!layerEnabled.chat) {
    studioSourceChat.querySelector('.studio-list-text')!.textContent = 'Chat'
    return
  }
  if (activeChatSourceId === 'placeholder') {
    studioSourceChat.querySelector('.studio-list-text')!.textContent = 'Chat — placeholder'
    return
  }
  const preset = CHAT_PINNED_PRESETS.find((p) => p.id === activeChatSourceId)
  if (preset) {
    studioSourceChat.querySelector('.studio-list-text')!.textContent = `Chat — ${preset.label}`
    return
  }
  studioSourceChat.querySelector('.studio-list-text')!.textContent = 'Chat — on'
}

async function refreshSourcePicker(kind: SourceKind): Promise<void> {
  const picker = sourcePickerEls[kind]
  picker.innerHTML = ''
  setPickerStatus(picker, 'Detecting…')

  try {
    if (kind === 'game') {
      const sources = await window.tabcast.listCaptureSources()
      const desktop = sources.filter((s) => s.type !== 'browser')
      picker.innerHTML = ''
      if (!desktop.length) {
        setPickerStatus(picker, 'No displays or windows found.')
        return
      }
      for (const source of desktop) {
        appendPickerButton(picker, {
          label: source.name,
          kindLabel: source.type === 'screen' ? 'Display' : 'Window',
          thumbnailDataUrl: source.thumbnailDataUrl || undefined,
          active: selectedSourceId === source.id,
          onPick: () => selectDesktopSource(source),
        })
      }
      return
    }

    if (kind === 'webcam') {
      await refreshAvDevices()
      picker.innerHTML = ''
      appendPickerButton(picker, {
        label: 'No camera',
        active: !cameraSelect.value,
        onPick: async () => {
          layerEnabled.cam = false
          cameraSelect.value = ''
          lastCameraSelectValue = ''
          await applyCamera()
          syncLayerTracks()
          void refreshSourcePicker('webcam')
        },
      })
      for (const opt of [...cameraSelect.options]) {
        if (!opt.value) continue
        appendPickerButton(picker, {
          label: opt.textContent ?? 'Camera',
          active: cameraSelect.value === opt.value,
          onPick: async () => {
            layerEnabled.cam = true
            cameraSelect.value = opt.value
            lastCameraSelectValue = opt.value
            if (opt.value === PHONE_CAMERA_DEVICE_VALUE) {
              preferPhoneCamera = true
            } else if (opt.value) {
              preferPhoneCamera = false
            }
            await applyCamera()
            syncLayerTracks()
            void refreshSourcePicker('webcam')
          },
        })
      }
      return
    }

    if (kind === 'mic') {
      await refreshAvDevices()
      picker.innerHTML = ''
      appendPickerButton(picker, {
        label: 'No microphone',
        active: !micSelect.value,
        onPick: async () => {
          layerEnabled.mic = false
          micSelect.value = ''
          lastMicSelectValue = ''
          await applyMic()
          syncLayerTracks()
          void refreshSourcePicker('mic')
        },
      })
      for (const opt of [...micSelect.options]) {
        if (!opt.value) continue
        appendPickerButton(picker, {
          label: opt.textContent ?? 'Microphone',
          active: micSelect.value === opt.value,
          onPick: async () => {
            layerEnabled.mic = true
            micSelect.value = opt.value
            lastMicSelectValue = opt.value
            await applyMic()
            syncLayerTracks()
            void refreshSourcePicker('mic')
          },
        })
      }
      return
    }

    if (kind === 'chat') {
      picker.innerHTML = ''
      appendPickerButton(picker, {
        label: 'Chat off',
        active: !layerEnabled.chat,
        onPick: () => {
          layerEnabled.chat = false
          activeChatSourceId = 'off'
          syncChatSourceRow()
          syncLayerTracks()
          void refreshSourcePicker('chat')
        },
      })
      appendPickerButton(picker, {
        label: 'Placeholder panel',
        kindLabel: 'Program',
        active: layerEnabled.chat && activeChatSourceId === 'placeholder',
        onPick: () => {
          layerEnabled.chat = true
          activeChatSourceId = 'placeholder'
          syncChatSourceRow()
          syncLayerTracks()
          void refreshSourcePicker('chat')
        },
      })
      appendPickerSectionHeader(picker, 'Chat presets (Search)')
      for (const preset of CHAT_PINNED_PRESETS) {
        appendPickerButton(picker, {
          label: preset.label,
          kindLabel: 'Pinned',
          active: layerEnabled.chat && activeChatSourceId === preset.id,
          onPick: async () => {
            await window.tabcast.openPinned(preset.id)
            layerEnabled.chat = true
            activeChatSourceId = preset.id
            syncChatSourceRow()
            syncLayerTracks()
            void refreshSourcePicker('chat')
          },
        })
      }
      const tabs = await window.tabcast.listTabs()
      const chatTabs = tabs.filter(isChatLikeTab)
      if (chatTabs.length) {
        appendPickerSectionHeader(picker, 'Search tabs')
        for (const tab of chatTabs) {
          appendPickerButton(picker, {
            label: tab.title || tab.url || 'Chat tab',
            kindLabel: tab.pinned ? 'Pinned' : 'Tab',
            active: layerEnabled.chat && activeChatSourceId === tab.id,
            onPick: async () => {
              await window.tabcast.activateTab(tab.id)
              layerEnabled.chat = true
              activeChatSourceId = tab.id
              syncChatSourceRow()
              syncLayerTracks()
              void refreshSourcePicker('chat')
            },
          })
        }
      }
      return
    }

    if (kind === 'notifications') {
      picker.innerHTML = ''
      appendPickerButton(picker, {
        label: 'Notifications off',
        active: !layerEnabled.notifications,
        onPick: () => {
          layerEnabled.notifications = false
          syncLayerTracks()
          void refreshSourcePicker('notifications')
        },
      })
      appendPickerButton(picker, {
        label: 'Placeholder overlay',
        kindLabel: 'Program',
        active: layerEnabled.notifications,
        onPick: () => {
          layerEnabled.notifications = true
          syncLayerTracks()
          void refreshSourcePicker('notifications')
        },
      })
      return
    }

    picker.innerHTML = ''
    appendPickerSectionHeader(picker, 'Layout presets')
    appendPickerButton(picker, {
      label: 'Follow scene layout',
      kindLabel: 'Composition',
      active: !activeOverlayPresetId,
      onPick: () => {
        activeOverlayPresetId = ''
        syncOverlaySourceRow()
        syncLayerTracks()
        void pushSceneLayout()
        void refreshSourcePicker('browser')
      },
    })
    for (const preset of OVERLAY_LAYOUT_PRESETS) {
      appendPickerButton(picker, {
        label: preset.name,
        kindLabel: 'Composition',
        active: activeOverlayPresetId === preset.id,
        onPick: () => selectOverlayPreset(preset.id),
      })
    }

    appendPickerSectionHeader(picker, 'Search tab overlay')
    appendPickerButton(picker, {
      label: 'Search tab off',
      kindLabel: 'Capture',
      active: !layerEnabled.browser,
      onPick: async () => {
        layerEnabled.browser = false
        await stopBrowserCapture()
        syncLayerTracks()
        void refreshSourcePicker('browser')
      },
    })

    const tabs = await window.tabcast.listTabs()
    if (!tabs.length) {
      const li = document.createElement('li')
      const p = document.createElement('p')
      p.className = 'studio-source-picker-status'
      p.textContent = 'Open a page in Search, then pick a tab below.'
      li.appendChild(p)
      picker.appendChild(li)
      return
    }
    for (const tab of tabs) {
      appendPickerButton(picker, {
        label: tab.title || tab.url || 'Untitled tab',
        kindLabel: tab.pinned ? 'Pinned' : 'Tab',
        active: activeBrowseTabId === tab.id && layerEnabled.browser,
        onPick: async () => {
          await window.tabcast.activateTab(tab.id)
          activeBrowseTabId = tab.id
          layerEnabled.browser = true
          await startBrowserCapture()
          syncLayerTracks()
          void refreshSourcePicker('browser')
        },
      })
    }
  } catch (err) {
    picker.innerHTML = ''
    setPickerStatus(
      picker,
      err instanceof Error ? err.message : 'Could not list sources for this type.',
    )
  }
}

function toggleGameLayer(): void {
  layerEnabled.game = !layerEnabled.game
  syncLayerTracks()
  void pushSceneLayout().catch(() => undefined)
}

function overlaySourceShowingInProgram(): boolean {
  return (
    (Boolean(browserStream) && layerEnabled.browser) ||
    (Boolean(activeOverlayPresetId) && layerEnabled.overlay)
  )
}

function toggleOverlaySourceLayer(): void {
  if (overlaySourceShowingInProgram()) {
    layerEnabled.overlay = false
    if (layerEnabled.browser || browserStream) {
      layerEnabled.browser = false
      void stopBrowserCapture()
      return
    }
    syncLayerTracks()
    void pushSceneLayout().catch(() => undefined)
    return
  }
  layerEnabled.overlay = true
  if (!browserStream && !activeOverlayPresetId) {
    layerEnabled.browser = true
    void startBrowserCapture()
    return
  }
  syncLayerTracks()
  void pushSceneLayout().catch(() => undefined)
}

function toggleLayerForSourceKind(kind: SourceKind): void {
  if (kind === 'game') {
    toggleGameLayer()
    return
  }
  if (kind === 'browser') {
    toggleOverlaySourceLayer()
    return
  }
  if (kind === 'webcam') {
    layerEnabled.cam = !layerEnabled.cam
    if (layerEnabled.cam && !cameraSelect.value) {
      void refreshSourcePicker('webcam')
    }
    syncLayerTracks()
    return
  }
  if (kind === 'chat') {
    layerEnabled.chat = !layerEnabled.chat
    if (layerEnabled.chat && activeChatSourceId === 'off') {
      activeChatSourceId = 'placeholder'
    }
    if (!layerEnabled.chat) {
      activeChatSourceId = 'off'
    }
    syncChatSourceRow()
    syncLayerTracks()
    return
  }
  if (kind === 'notifications') {
    layerEnabled.notifications = !layerEnabled.notifications
    syncLayerTracks()
  }
}

function toggleSourcePicker(kind: SourceKind): void {
  const wasOpen = expandedSourceKinds.has(kind)
  expandedSourceKinds.clear()
  if (!wasOpen) {
    expandedSourceKinds.add(kind)
    void refreshSourcePicker(kind)
  }
  syncSourcePickerVisibility()
}

function renderSources(sources: CaptureSource[]): void {
  sourceList.innerHTML = ''
  if (expandedSourceKinds.has('game')) {
    void refreshSourcePicker('game')
  }
}

async function selectDesktopSource(source: CaptureSource): Promise<void> {
  selectedSourceId = source.id
  captureKind = 'desktop'
  layerEnabled.game = true

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
    syncProgramVideoSurface()
    layerGame.dataset.active = '1'
    layerGame.textContent = `Gameplay — ${source.name}`
    syncLayerTracks()
    if (currentMode !== 'studio') {
      await window.tabcast.setMode('studio')
    }
    if (expandedSourceKinds.has('game')) {
      void refreshSourcePicker('game')
    }
    void refreshGameAudioCapture()
  } catch (err) {
    programVideo.srcObject = null
    syncProgramVideoSurface()
    programEmpty.textContent =
      err instanceof Error ? err.message : 'Could not capture this source'
    layerGame.dataset.active = '0'
    layerGame.textContent = 'Gameplay — none'
    captureKind = null
    void refreshGameAudioCapture()
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
      syncProgramVideoSurface()
      programEmpty.textContent = 'Capture source ended. Select a source again.'
      layerGame.dataset.active = '0'
      layerGame.textContent = 'Gameplay — none'
      programStream = null
      captureKind = null
      selectedSourceId = null
      void refreshGameAudioCapture()
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
  layerEnabled.browser = false
  programBrowserVideo.srcObject = null
  await window.tabcast.setBrowseCaptureActive(false)
  updateProgramBrowserOverlay()
  syncOverlaySourceRow()
  syncLayerTracks()
}

async function startBrowserCapture(): Promise<void> {
  layerEnabled.browser = true
  stopStream(browserStream)
  browserStream = null

  const target = await window.tabcast.getBrowseCaptureTarget()
  if (!target) {
    syncOverlaySourceRow()
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
    syncOverlaySourceRow()
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

  if (!programStream && !isSceneStubId(activeSceneTemplateId)) {
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
    for (const kind of expandedSourceKinds) {
      await refreshSourcePicker(kind)
    }
  } catch (err) {
    for (const kind of expandedSourceKinds) {
      setPickerStatus(
        sourcePickerEls[kind],
        err instanceof Error ? err.message : 'Could not list sources',
      )
    }
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
  const preferredMic = micSelect.dataset.preferredMic
  if (preferredMic && [...micSelect.options].some((o) => o.value === preferredMic)) {
    micSelect.value = preferredMic
  } else if ([...micSelect.options].some((o) => o.value === micValue)) {
    micSelect.value = micValue
  }
}

function syncWhipAvTracks(): void {
  if (!whipPublisher) return
  const pc = whipPublisher.pc
  const gameplayIds = new Set(programStream?.getVideoTracks().map((t) => t.id) ?? [])
  const browserIds = new Set(browserStream?.getVideoTracks().map((t) => t.id) ?? [])

  let webcamSender: RTCRtpSender | null = null
  for (const sender of pc.getSenders()) {
    const track = sender.track
    if (!track) continue
    if (track.kind === 'video' && !gameplayIds.has(track.id) && !browserIds.has(track.id)) {
      webcamSender = sender
    }
  }

  const nextWebcam =
    layerEnabled.cam && cameraStream
      ? cameraStream.getVideoTracks().find((t) => t.readyState === 'live') ?? null
      : null
  const nextMic = whipLiveAudioTrack(micStream, layerEnabled.mic && !micMuted)
  const nextDesktop = whipLiveAudioTrack(
    desktopAudioStream,
    layerEnabled.desktopAudio && !desktopAudioMuted,
  )
  const nextGame = whipLiveAudioTrack(gameAudioStream, layerEnabled.gameAudio && !gameAudioMuted)

  if (webcamSender) void webcamSender.replaceTrack(nextWebcam).catch(() => undefined)
  const { audioSenders } = whipPublisher
  if (audioSenders.mic) void audioSenders.mic.replaceTrack(nextMic).catch(() => undefined)
  if (audioSenders.desktop) {
    void audioSenders.desktop.replaceTrack(nextDesktop).catch(() => undefined)
  }
  if (audioSenders.game) void audioSenders.game.replaceTrack(nextGame).catch(() => undefined)
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
  syncWhipAvTracks()
  updateStudioMixControls()
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
    if (!captureReadyForGoLive()) {
      throw new Error(goLiveCaptureError())
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
    syncWhipAvTracks()
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

async function verifyStreamKeys(): Promise<{ ok: boolean; message: string }> {
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

    return { ok: true, message: result.message ?? 'Keys look good.' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message }
  }
}

async function onVerifyKeys(): Promise<void> {
  setDestError(null)
  destHint.textContent = 'Verifying…'
  const result = await verifyStreamKeys()
  if (result.ok) {
    destHint.textContent = result.message
    setDestError(null)
  } else {
    setDestError(result.message)
    destHint.textContent = 'Keys stay in relay RAM only. Go Live publishes WHIP to localhost — not OBS.'
  }
}

for (const tab of document.querySelectorAll<HTMLButtonElement>('.tab')) {
  tab.addEventListener('click', () => {
    const mode = tab.dataset.tab as 'studio'
    if (mode !== 'studio') return
    if (currentMode === 'settings') {
      void window.tabcast.exitSettingsMode()
    }
    if (currentMode !== 'studio') {
      void window.tabcast.setMode('studio')
      void window.tabcast.setSettings({ startupMode: 'studio' })
    }
  })
}

if (programOutputMode) {
  programOutputMode.addEventListener('change', () => {
    const mode = programOutputMode.value as AppMode
    if (mode !== 'studio' && mode !== 'browse') return
    void window.tabcast.setMode(mode)
    void window.tabcast.setSettings({ startupMode: mode })
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

const settingsView = initSettingsView(window.tabcast, {
  onLabModeChange: (nextLab) => {
    labMode = nextLab
    destHint.textContent = labMode
      ? 'Demo mode on — key format checks skipped (for testing and walkthroughs).'
      : 'Keys stay in relay RAM only. Go Live publishes WHIP to localhost.'
  },
  onStartupModeChange: (mode) => {
    if (currentMode === 'settings') return
    void window.tabcast.setMode(mode)
  },
  onEncodeProfileChange: (id) => {
    syncEncodeProfileSelects(id)
    updateProgramStats()
    syncStreamInfoMeta()
    void pushSceneLayout().catch(() => undefined)
  },
  onRecordingFolderChange: (folder) => {
    recordingSaveFolder = folder
    syncRecordingButtonHint()
  },
  onPreferredMicChange: (deviceId) => {
    if ([...micSelect.options].some((o) => o.value === deviceId)) {
      micSelect.value = deviceId
      void applyMic()
    }
  },
  onReplaySetup: () => {
    void window.tabcast.exitSettingsMode().then(() => {
      window.setTimeout(() => setupWizard.start(), 200)
    })
  },
  onReplayTour: () => {
    void window.tabcast.exitSettingsMode().then(() => {
      window.setTimeout(() => onboardingTour.start(), 200)
    })
  },
  onCheckUpdates: () => {
    void window.tabcast.checkForUpdates().then(renderUpdateBanner)
  },
})

btnSettings.addEventListener('click', () => {
  if (currentMode === 'settings') {
    void window.tabcast.exitSettingsMode()
    return
  }
  void settingsView.open().then(() => {
    void window.tabcast.setMode('settings')
  })
})
camScale.addEventListener('input', () => {
  updateProgramCamOverlay()
})
camScale.addEventListener('change', () => {
  updateProgramCamOverlay()
  void pushSceneLayout()
})
function toggleBrowserLayer(): void {
  layerEnabled.browser = !layerEnabled.browser
  if (layerEnabled.browser && !browserStream) {
    void startBrowserCapture()
    return
  }
  if (!layerEnabled.browser) {
    void stopBrowserCapture()
  }
  syncLayerTracks()
  void pushSceneLayout()
}

function toggleWebcamLayer(): void {
  layerEnabled.cam = !layerEnabled.cam
  syncLayerTracks()
  void pushSceneLayout()
}

function toggleMicLayer(): void {
  layerEnabled.mic = !layerEnabled.mic
  if (!layerEnabled.mic) {
    micMuted = false
  }
  syncLayerTracks()
  void pushSceneLayout()
}

toggleWebcam.addEventListener('click', () => {
  toggleWebcamLayer()
})
toggleMic.addEventListener('click', () => {
  toggleMicLayer()
})

function onSourceMenuActivate(kind: SourceKind, event: Event): void {
  event.preventDefault()
  event.stopPropagation()
  toggleSourcePicker(kind)
}

for (const kind of SOURCE_KINDS) {
  const menu = sourceMenuEl(kind)
  menu?.addEventListener('click', (event) => onSourceMenuActivate(kind, event))
  menu?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    onSourceMenuActivate(kind, event)
  })

  sourceToggleEls[kind].addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('[data-source-menu]')) return
    if (kind === 'mic') {
      toggleMicLayer()
      return
    }
    toggleLayerForSourceKind(kind)
  })
}

const micMixerSettingsBtn = document.querySelector(
  '#audio-mic .audio-channel-settings',
) as HTMLButtonElement | null
micMixerSettingsBtn?.addEventListener('click', () => {
  if (!expandedSourceKinds.has('mic')) {
    toggleSourcePicker('mic')
  }
  studioSourceMic.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

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
    // Filter out Discord addon from UI
    console.log('Checking panel:', panel.addonId); if (panel.addonId === 'com.tabcast.discord-now-live') { console.log('Filtering out Discord'); continue; }

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

programQualitySelect.addEventListener('change', () => {
  onEncodeProfileChanged(normalizeEncodeProfileId(programQualitySelect.value))
})

platTwitch.addEventListener('click', () => {
  openPlatformKeyDialog('twitch')
})
platYoutube.addEventListener('click', () => {
  openPlatformKeyDialog('youtube')
})

platformKeyForm.addEventListener('submit', (event) => {
  const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null
  if (submitter?.value === 'save') {
    void persistStreamDestinationsFromUi()
  }
  void window.tabcast.getRelay().then(renderPlatformStatus)
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
    void refreshGameAudioCapture()
  } catch (err) {
    console.error('teardownLiveSession', err)
  }
}

window.tabcast.onPrepareQuit(() => {
  if (programVirtualCamera.isActive()) {
    programVirtualCamera.stop()
    setVcamUi(false)
  }
  if (programRecording.isRecording()) {
    void programRecording.stop().finally(() => {
      programOutputCompositor.stop()
    })
  } else {
    programOutputCompositor.stop()
  }
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
  recordingSaveFolder = s.recordingSaveFolder ?? ''
  lastStreamPlatform = s.lastStreamPlatform ?? 'none'
  syncRecordingButtonHint()
  const profile = normalizeEncodeProfileId(s.bitrateProfile)
  syncEncodeProfileSelects(profile)
  updateProgramStats()
  Object.assign(sceneImagePaths, s.sceneImages ?? {})
  customScenes = coerceCustomScenes(s.customScenes ?? [])
  if (s.streamDestinations) {
    applyStreamDestinations(s.streamDestinations)
  }
  renderCustomSceneRows()
  syncAddSceneButtons()
  syncSceneImagePanel()
  syncSceneProgramPresentation()
  refreshProgramPreviewLayout()
  if (s.preferredMicDeviceId) {
    micSelect.dataset.preferredMic = s.preferredMicDeviceId
  }
  preferredDesktopOutputDeviceId = s.preferredDesktopAudioOutputDeviceId ?? ''
  if (systemAudioCaptureSupported(capturePlatform)) {
    void refreshDesktopAudioOutputDevices().then(() => refreshDesktopAudioCapture())
  }
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
    const next = currentMode === 'browse' ? 'studio' : 'browse'
    void window.tabcast.setMode(next)
    void window.tabcast.setSettings({ startupMode: next })
  }
})

window.tabcast.onMode(applyMode)
window.tabcast.onNavigated((state) => {
  urlInput.value = state.url
})
window.tabcast.onTitle((title) => {
  if (currentMode !== 'browse') return
  document.title = title ? `${title} · Maka — Browser` : 'Maka — Browser'
})

initMarketplace(window.tabcast, {
  dialog: document.getElementById('marketplace-dialog') as HTMLDialogElement,
  list: document.getElementById('marketplace-list')!,
  openControl: document.getElementById('btn-open-marketplace'),
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

syncDestinationInputs()
syncProgramVideoSurface()
updateStudioMixControls()
void window.tabcast.getMode().then(applyMode)
void settingsView.refreshVersions()
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
// Scene buttons
const sceneGameplay = document.getElementById('scene-gameplay') as HTMLButtonElement
const sceneStarting = document.getElementById('scene-starting') as HTMLButtonElement
const sceneChatting = document.getElementById('scene-chatting') as HTMLButtonElement
const sceneIntermission = document.getElementById('scene-intermission') as HTMLButtonElement
const sceneEnding = document.getElementById('scene-ending') as HTMLButtonElement
const btnAddScene = document.getElementById('btn-add-scene') as HTMLButtonElement
const btnAddSceneAlt = document.getElementById('btn-add-scene-alt') as HTMLButtonElement

// Audio mixer
const audioMixer = document.getElementById('audio-mixer')

// Stream info
const streamStatus = document.getElementById('stream-status')
const streamInfo = document.getElementById('stream-info')
const btnGoLiveSidebar = document.getElementById('btn-go-live-sidebar') as HTMLButtonElement

// Program stats
const programStats = document.getElementById('program-stats')
const statDropped = document.getElementById('stat-dropped')
const statFps = document.getElementById('stat-fps')
const statLatency = document.getElementById('stat-latency')
const statBitrate = document.getElementById('stat-bitrate')

function highlightSceneSelection(sceneTemplate: string): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('.studio-list-item[data-scene]')
  for (const btn of buttons) {
    btn.dataset.active = btn.dataset.scene === sceneTemplate ? '1' : '0'
  }
}

function syncAddSceneButtons(): void {
  const atMax = customScenes.length >= MAX_CUSTOM_SCENES
  const title = atMax ? `Maximum of ${MAX_CUSTOM_SCENES} custom scenes` : 'Add scene'
  if (btnAddScene) {
    btnAddScene.disabled = atMax
    btnAddScene.title = title
  }
  if (btnAddSceneAlt) {
    btnAddSceneAlt.disabled = atMax
    btnAddSceneAlt.title = title
  }
}

function renderCustomSceneRows(): void {
  studioScenesList
    .querySelectorAll<HTMLLIElement>('li[data-custom-scene-row]')
    .forEach((row) => row.remove())
  for (const scene of customScenes) {
    const li = document.createElement('li')
    li.dataset.customSceneRow = '1'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'studio-list-item'
    btn.dataset.scene = scene.id
    btn.dataset.active = activeSceneTemplateId === scene.id ? '1' : '0'

    const leading = document.createElement('span')
    leading.className = 'studio-list-leading scene-icon'
    leading.setAttribute('aria-hidden', 'true')
    leading.textContent = '▶️'

    const nameInput = document.createElement('input')
    nameInput.type = 'text'
    nameInput.className = 'studio-scene-name-input studio-list-text'
    nameInput.value = scene.name
    nameInput.spellcheck = false
    nameInput.setAttribute('aria-label', 'Scene name')
    nameInput.title = 'Double-click to rename'
    nameInput.addEventListener('click', (event) => event.stopPropagation())
    nameInput.addEventListener('dblclick', (event) => {
      event.stopPropagation()
      nameInput.select()
    })
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        nameInput.blur()
      }
    })
    nameInput.addEventListener('blur', () => {
      void renameCustomScene(scene.id, nameInput.value)
    })

    const menu = document.createElement('span')
    menu.setAttribute('role', 'button')
    menu.tabIndex = 0
    menu.className = 'studio-list-menu'
    menu.dataset.sceneMenu = scene.id
    menu.setAttribute('aria-label', 'Scene options')
    menu.title = 'Scene options'
    menu.textContent = '⋯'

    btn.append(leading, nameInput, menu)
    btn.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('[data-scene-menu]')) return
      void selectScene(scene.id)
    })
    li.append(btn)
    studioScenesList.insertBefore(li, studioAddSceneRow)
  }
}

async function persistCustomScenes(next: CustomScene[]): Promise<void> {
  customScenes = coerceCustomScenes(next)
  await window.tabcast.setSettings({ customScenes })
  renderCustomSceneRows()
  syncAddSceneButtons()
  syncSceneImagePanel()
}

async function renameCustomScene(sceneId: string, rawName: string): Promise<void> {
  if (!isCustomSceneId(sceneId)) return
  const trimmed = rawName.trim().slice(0, 80) || defaultCustomSceneName(sceneId)
  const index = customScenes.findIndex((s) => s.id === sceneId)
  if (index < 0 || customScenes[index].name === trimmed) return
  const next = customScenes.map((s) => (s.id === sceneId ? { ...s, name: trimmed } : s))
  await persistCustomScenes(next)
}

async function addCustomScene(): Promise<void> {
  const id = nextCustomSceneId(customScenes)
  if (!id) return
  const next: CustomScene[] = [...customScenes, { id, name: defaultCustomSceneName(id) }]
  await persistCustomScenes(next)
  await selectScene(id)
  const input = studioScenesList.querySelector<HTMLInputElement>(
    `button[data-scene="${id}"] .studio-scene-name-input`,
  )
  if (input) {
    input.focus()
    input.select()
  }
}

async function persistSceneImage(sceneId: string, filePath: string | null): Promise<void> {
  if (!sceneSupportsImageUpload(sceneId)) return
  const previous = sceneImagePaths[sceneId]
  if (filePath) {
    sceneImagePaths[sceneId] = filePath
  } else {
    delete sceneImagePaths[sceneId]
    if (previous) sceneImageDataUrlCache.delete(previous)
  }
  await window.tabcast.setSettings({
    sceneImages: { [sceneId]: filePath ?? '' },
  })
  if (sceneId === activeSceneTemplateId) {
    syncSceneProgramPresentation()
    refreshProgramPreviewLayout()
    if (isSessionLive()) {
      await pushSceneLayout().catch(() => undefined)
    }
  } else {
    syncSceneImagePanel()
  }
}

async function chooseSceneImage(sceneId: string): Promise<void> {
  if (!sceneSupportsImageUpload(sceneId)) return
  const picked = await window.tabcast.pickSceneImageFile()
  if (picked.canceled) return
  sceneImageDataUrlCache.set(picked.path, picked.dataUrl)
  await persistSceneImage(sceneId, picked.path)
}

// Scene selection handler
async function selectScene(sceneTemplate: string): Promise<void> {
  activeSceneTemplateId = sceneTemplate
  activeOverlayPresetId = ''
  highlightSceneSelection(sceneTemplate)
  syncOverlaySourceRow()

  if (sceneTemplate === 'gaming-cam') {
    layerEnabled.game = true
    layerEnabled.cam = true
  } else if (sceneTemplate === 'desk-only' || isCustomSceneId(sceneTemplate)) {
    layerEnabled.game = false
    layerEnabled.cam = true
  } else if (isSceneStubId(sceneTemplate)) {
    layerEnabled.game = false
    layerEnabled.cam = false
  }

  syncLayerTracks()
  syncSceneProgramPresentation()
  refreshProgramPreviewLayout()
  if (isSessionLive()) {
    await pushSceneLayout().catch(() => undefined)
  }
}

// Wire scene buttons
if (sceneGameplay) {
  sceneGameplay.addEventListener('click', () => selectScene('gaming-cam'))
}
if (sceneChatting) {
  sceneChatting.addEventListener('click', () => selectScene('desk-only'))
}
if (sceneStarting) {
  sceneStarting.addEventListener('click', () => selectScene('starting-soon'))
}
if (sceneIntermission) {
  sceneIntermission.addEventListener('click', () => selectScene('intermission'))
}
if (sceneEnding) {
  sceneEnding.addEventListener('click', () => selectScene('ending'))
}

function openSceneImageMenuFromTarget(menu: HTMLElement): void {
  const id = menu.dataset.sceneMenu
  if (!id || !sceneSupportsImageUpload(id)) return
  sceneImageMenuTargetId = id
  sceneImageMenuClear.disabled = !sceneImagePaths[id]
  sceneImageMenuDialog.showModal()
}

studioScenesList.addEventListener(
  'click',
  (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-scene-menu]')
    if (!target || target.classList.contains('studio-list-menu--static')) return
    event.preventDefault()
    event.stopPropagation()
    openSceneImageMenuFromTarget(target)
  },
  true,
)

studioScenesList.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-scene-menu]')
    if (!target || target.classList.contains('studio-list-menu--static')) return
    event.preventDefault()
    event.stopPropagation()
    openSceneImageMenuFromTarget(target)
  },
  true,
)

sceneImageMenuPick.addEventListener('click', () => {
  sceneImageMenuDialog.close()
  const target = sceneImageMenuTargetId
  if (!target) return
  void chooseSceneImage(target)
})

sceneImageMenuClear.addEventListener('click', () => {
  sceneImageMenuDialog.close()
  const target = sceneImageMenuTargetId
  if (!target) return
  void persistSceneImage(target, null)
})

sceneImageMenuCancel.addEventListener('click', () => {
  sceneImageMenuDialog.close()
})

btnSceneImagePick.addEventListener('click', () => {
  if (!sceneSupportsImageUpload(activeSceneTemplateId)) return
  void chooseSceneImage(activeSceneTemplateId)
})

btnSceneImageClear.addEventListener('click', () => {
  if (!sceneSupportsImageUpload(activeSceneTemplateId)) return
  void persistSceneImage(activeSceneTemplateId, null)
})

syncAddSceneButtons()
if (btnAddScene) {
  btnAddScene.addEventListener('click', () => {
    void addCustomScene()
  })
}
if (btnAddSceneAlt) {
  btnAddSceneAlt.addEventListener('click', () => {
    void addCustomScene()
  })
}

const goLiveWizardDialog = document.getElementById('go-live-wizard-dialog') as HTMLDialogElement
const goLiveWizard = new GoLiveWizard(
  goLiveWizardDialog,
  document.getElementById('go-live-wizard-step')!,
  document.getElementById('go-live-wizard-title')!,
  document.getElementById('go-live-wizard-body')!,
  document.getElementById('go-live-wizard-status')!,
  document.getElementById('go-live-wizard-panel-platform')!,
  document.getElementById('go-live-wizard-panel-key')!,
  document.getElementById('go-live-wizard-panel-validate')!,
  document.getElementById('go-live-wizard-panel-go')!,
  document.querySelectorAll<HTMLInputElement>('input[name="go-live-platform"]'),
  document.getElementById('wizard-twitch-key') as HTMLInputElement,
  document.getElementById('wizard-youtube-key') as HTMLInputElement,
  document.getElementById('wizard-custom-rtmp-url') as HTMLInputElement,
  document.getElementById('wizard-custom-rtmp-key') as HTMLInputElement,
  document.getElementById('go-live-wizard-custom-fields')!,
  document.getElementById('go-live-wizard-quality') as HTMLSelectElement,
  document.getElementById('go-live-wizard-go-status')!,
  document.getElementById('go-live-wizard-back') as HTMLButtonElement,
  document.getElementById('go-live-wizard-next') as HTMLButtonElement,
  document.getElementById('go-live-wizard-cancel') as HTMLButtonElement,
  {
    hasCustomRtmp: () => !destCustomBlock.hidden,
    isLive: () => isSessionLive(),
    readUi: () => ({
      destTwitch: destTwitch.checked,
      destYoutube: destYoutube.checked,
      destCustom: destCustom.checked,
      twitchKey: twitchKey.value,
      youtubeKey: youtubeKey.value,
      customUrl: customRtmpUrl.value,
      customKey: customRtmpKey.value,
    }),
    applyPlatform: applyWizardPlatform,
    applyKeys: (partial) => {
      if (partial.twitchKey !== undefined) twitchKey.value = partial.twitchKey
      if (partial.youtubeKey !== undefined) youtubeKey.value = partial.youtubeKey
      if (partial.customUrl !== undefined) customRtmpUrl.value = partial.customUrl
      if (partial.customKey !== undefined) customRtmpKey.value = partial.customKey
      syncDestinationInputs()
      void persistStreamDestinationsFromUi()
    },
    validate: async () => {
      if (labMode) {
        return { ok: true, message: 'Demo mode — skipped relay verification.' }
      }
      return verifyStreamKeys()
    },
    goLive: async () => {
      await goLive()
    },
    endLive: async () => {
      await endLive()
    },
    readEncodeProfile: () => selectedProfile(),
    applyEncodeProfile: (id) => onEncodeProfileChanged(id),
    readPreferredPlatform: () => lastStreamPlatform,
  },
)

populateEncodeProfileSelect(
  document.getElementById('go-live-wizard-quality') as HTMLSelectElement,
)

if (btnGoLiveSidebar) {
  btnGoLiveSidebar.addEventListener('click', () => {
    void window.tabcast.getSettings().then((s) => {
      lastStreamPlatform = s.lastStreamPlatform ?? 'none'
      goLiveWizard.open()
    })
  })
}

function droppedFramesFromRelay(snapshot?: RelaySnapshot | null): number {
  const status = snapshot?.status
  if (!status || typeof status !== 'object') return 0
  const raw = (status as { droppedFrames?: unknown }).droppedFrames
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0
}

function formatMbpsLabel(mbps: number): string {
  const text = Number.isInteger(mbps) ? String(mbps) : mbps.toFixed(1)
  return `${text} Mbps`
}

function relayObservedBitrateMbps(snapshot?: RelaySnapshot | null): number | undefined {
  const status = snapshot?.status
  if (!status || typeof status !== 'object') return undefined
  const raw = (status as { bitrateMbps?: unknown }).bitrateMbps
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : undefined
}

function updateProgramStats(snapshot?: RelaySnapshot | null): void {
  const profile = selectedProfile()
  const spec = encodeProfileSpec(profile)
  const dropped = droppedFramesFromRelay(snapshot)
  const dropPct = dropped === 0 ? '0.0' : '—'
  const sessionLive = snapshot?.lifecycle === 'live' || isSessionLive()
  const targetMbps = spec.bitrateMbps
  const observedMbps = relayObservedBitrateMbps(snapshot)
  const displayMbps = sessionLive && observedMbps != null ? observedMbps : targetMbps

  if (statDropped) {
    statDropped.textContent = `Dropped Frames: ${dropped} (${dropPct}%)`
  }
  if (statFps) {
    statFps.textContent = `FPS: ${spec.fps}`
  }
  if (statLatency) {
    statLatency.textContent = '—'
  }
  if (statBitrate) {
    statBitrate.textContent = formatMbpsLabel(displayMbps)
  }
  if (programQualitySelect) {
    programQualitySelect.title = sessionLive
      ? `${spec.menuLabel} · transmitting at ${formatMbpsLabel(displayMbps)}`
      : `${spec.menuLabel} · ${formatMbpsLabel(targetMbps)} target`
  }
}

initEncodeProfileControls()

// Stream control buttons
const btnStartRecording = document.getElementById('btn-start-recording') as HTMLButtonElement | null
const btnStartVcam = document.getElementById('btn-start-vcam') as HTMLButtonElement | null
const btnVcamLabel = document.getElementById('btn-vcam-label')
const btnRecordingLabel = document.getElementById('btn-recording-label')
const statRecording = document.getElementById('stat-recording')
const statVcam = document.getElementById('stat-vcam')
const vcamUnavailableDialog = document.getElementById('vcam-unavailable-dialog') as HTMLDialogElement | null
const vcamInfoLimitation = document.getElementById('vcam-info-limitation')
const vcamInfoFallbackPanel = document.getElementById('vcam-info-fallback-panel')
const vcamOpenFallbackUrl = document.getElementById('vcam-open-fallback-url') as HTMLButtonElement | null
const vcamCopyFrame = document.getElementById('vcam-copy-frame') as HTMLButtonElement | null
const vcamInfoStatus = document.getElementById('vcam-info-status')

const programOutputDeps = {
  getProgramVideo: () => programVideo,
  getWebcamVideo: () => programCamVideo,
  hasGameplayVideo: () =>
    Boolean(programStream?.getVideoTracks().some((track) => track.readyState === 'live')),
  getMicStream: () => micStream,
  getDesktopAudioStream: () => desktopAudioStream,
  getGameAudioStream: () => gameAudioStream,
  getEncodeSpec: () => encodeProfileSpec(selectedProfile()),
}

const programOutputCompositor = createProgramOutputCompositor(programOutputDeps)

const programRecording = createProgramRecording({
  ...programOutputDeps,
  compositor: programOutputCompositor,
})

const programVirtualCamera = createProgramVirtualCamera({
  ...programOutputDeps,
  compositor: programOutputCompositor,
})

let vcamCapability: VcamCapability | null = null
let vcamInfoSeen = false

function stopProgramOutputCompositorIfIdle(): void {
  if (!programRecording.isRecording() && !programVirtualCamera.isActive()) {
    programOutputCompositor.stop()
  }
}

function setVcamUi(active: boolean): void {
  if (btnStartVcam) btnStartVcam.dataset.vcam = active ? '1' : '0'
  if (btnVcamLabel) {
    btnVcamLabel.textContent = active ? 'Stop Virtual Camera' : 'Start Virtual Camera'
  }
  if (statVcam) {
    statVcam.hidden = !active
    statVcam.dataset.vcam = active ? '1' : '0'
    statVcam.textContent = active ? 'Virtual cam preview' : 'Virtual cam off'
  }
  if (btnStartVcam) {
    const previewNote = vcamCapability?.canOutputToDevice
      ? 'Outputs to a system virtual camera device.'
      : 'Preview mode: program compositor only (no system camera device in this build). Shift+click for help.'
    btnStartVcam.title = active
      ? `Stop virtual camera preview. ${previewNote}`
      : `Start virtual camera preview. ${previewNote}`
  }
}

function setVcamInfoStatus(message: string, state: 'ok' | 'error' | ''): void {
  if (!vcamInfoStatus) return
  vcamInfoStatus.textContent = message
  if (state) vcamInfoStatus.dataset.state = state
  else delete vcamInfoStatus.dataset.state
}

function hydrateVcamInfoDialog(cap: VcamCapability): void {
  if (vcamInfoLimitation) vcamInfoLimitation.textContent = cap.limitationMessage
  if (vcamInfoFallbackPanel) {
    vcamInfoFallbackPanel.hidden = !cap.recommendedFallback
  }
}

async function ensureVcamCapability(): Promise<VcamCapability> {
  if (vcamCapability) return vcamCapability
  const cap = await window.tabcast.getVcamCapability()
  vcamCapability = cap
  hydrateVcamInfoDialog(cap)
  setVcamUi(programVirtualCamera.isActive())
  return cap
}

function openVcamInfoDialog(): void {
  void ensureVcamCapability().then(() => {
    setVcamInfoStatus('', '')
    vcamUnavailableDialog?.showModal()
  })
}

function setRecordingUi(active: boolean): void {
  if (btnStartRecording) btnStartRecording.dataset.recording = active ? '1' : '0'
  if (btnRecordingLabel) {
    btnRecordingLabel.textContent = active ? 'Stop Recording' : 'Start Recording'
  }
  if (statRecording) {
    statRecording.dataset.recording = active ? '1' : '0'
    statRecording.textContent = active ? 'Now recording' : 'Not recording'
  }
}

function syncRecordingButtonHint(): void {
  if (!btnStartRecording) return
  const base = 'Record program output locally (not streaming).'
  if (recordingSaveFolder.trim()) {
    btnStartRecording.title = `${base} Stops save to your recording folder. Shift+click Stop to choose location.`
  } else {
    btnStartRecording.title = `${base} Shift+click Stop to choose save location.`
  }
}

if (btnStartRecording) {
  btnStartRecording.addEventListener('click', (ev) => {
    void (async () => {
      if (programRecording.isRecording()) {
        const blob = await programRecording.stop()
        setRecordingUi(false)
        stopProgramOutputCompositorIfIdle()
        if (!blob) {
          setDestError('Recording produced no data.')
          return
        }
        const ext = recordingFileExtension(blob)
        const defaultName = buildRecordingFileName(selectedProfile(), ext)
        const data = await blob.arrayBuffer()
        const forceDialog = ev.shiftKey
        const saved = await window.tabcast.saveRecording({
          data,
          defaultName,
          ext,
          forceDialog,
        })
        if (!saved.canceled) {
          setDestError(null)
          destHint.textContent = `Recording saved: ${saved.filePath}`
        }
        return
      }
      try {
        setDestError(null)
        await programRecording.start()
        setRecordingUi(true)
        destHint.textContent =
          'Recording program video (canvas compositor). PiP, browser overlay, and scene PNG masks are not in the file yet.'
      } catch (err) {
        setDestError(err instanceof Error ? err.message : String(err))
      }
    })()
  })
}

if (btnStartVcam) {
  btnStartVcam.addEventListener('click', (ev) => {
    void (async () => {
      if (ev.shiftKey) {
        openVcamInfoDialog()
        return
      }
      await ensureVcamCapability()
      if (programVirtualCamera.isActive()) {
        programVirtualCamera.stop()
        stopProgramOutputCompositorIfIdle()
        setVcamUi(false)
        destHint.textContent = 'Virtual camera preview stopped.'
        return
      }
      try {
        setDestError(null)
        programVirtualCamera.start()
        setVcamUi(true)
        if (!vcamInfoSeen && vcamCapability && !vcamCapability.canOutputToDevice) {
          vcamInfoSeen = true
          openVcamInfoDialog()
        }
        destHint.textContent =
          'Virtual camera preview active (program compositor). Other apps cannot use Maka as a camera device in this build — Shift+click Virtual Camera for OBS fallback steps.'
      } catch (err) {
        setDestError(err instanceof Error ? err.message : String(err))
      }
    })()
  })
}

if (vcamOpenFallbackUrl) {
  vcamOpenFallbackUrl.addEventListener('click', () => {
    void ensureVcamCapability().then((cap) => {
      const url = cap.recommendedFallback?.url
      if (url) void window.tabcast.openExternal(url)
    })
  })
}

if (vcamCopyFrame) {
  vcamCopyFrame.addEventListener('click', () => {
    void (async () => {
      try {
        setVcamInfoStatus('', '')
        await programVirtualCamera.copyProgramFrameToClipboard()
        setVcamUi(programVirtualCamera.isActive())
        setVcamInfoStatus('Program frame copied to clipboard as PNG.', 'ok')
      } catch (err) {
        setVcamInfoStatus(err instanceof Error ? err.message : String(err), 'error')
      }
    })()
  })
}

void ensureVcamCapability()
const btnGoLiveLabel = document.getElementById('btn-go-live-label') as HTMLElement | null

// Stream info elements
const streamThumb = document.getElementById('stream-thumb') as HTMLElement | null
const streamTitle = document.getElementById('stream-title') as HTMLElement | null
const streamCategory = document.getElementById('stream-category') as HTMLElement | null
const streamLivePill = document.getElementById('stream-live-pill') as HTMLElement | null
const streamViewers = document.getElementById('stream-viewers') as HTMLElement | null
const streamDuration = document.getElementById('stream-duration') as HTMLElement | null

// Update Go Live button label based on streaming state
function updateGoLiveLabel(isLive: boolean): void {
  if (btnGoLiveLabel) {
    btnGoLiveLabel.textContent = isLive ? 'End Live' : 'Go Live'
  }
}

let liveSessionStartedAt: number | null = null
let streamDurationTimer: ReturnType<typeof setInterval> | null = null

function formatStreamDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

function streamDestinationMeta(): { title: string; category: string } {
  const parts: string[] = []
  if (destTwitch.checked) {
    parts.push(twitchKey.value.trim() ? 'Twitch' : 'Twitch (add key)')
  }
  if (destYoutube.checked) {
    parts.push(youtubeKey.value.trim() ? 'YouTube' : 'YouTube (add key)')
  }
  if (destCustom.checked) {
    parts.push(customRtmpKey.value.trim() ? 'Custom RTMP' : 'Custom RTMP (add key)')
  }
  const title =
    parts.length > 0
      ? parts.join(' · ')
      : 'No destination — use Twitch or YouTube in the stats bar'
  const category = encodeProfileSpec(selectedProfile()).menuLabel
  return { title, category }
}

function syncStreamInfoMeta(): void {
  const meta = streamDestinationMeta()
  if (streamTitle) streamTitle.textContent = meta.title
  if (streamCategory) streamCategory.textContent = meta.category
}

function setLiveDurationClock(active: boolean): void {
  if (streamDurationTimer) {
    clearInterval(streamDurationTimer)
    streamDurationTimer = null
  }
  if (!active) {
    liveSessionStartedAt = null
    if (streamDuration) streamDuration.textContent = '—'
    return
  }
  liveSessionStartedAt = liveSessionStartedAt ?? Date.now()
  streamDurationTimer = setInterval(() => {
    if (!streamDuration || liveSessionStartedAt === null) return
    streamDuration.textContent = formatStreamDuration(Date.now() - liveSessionStartedAt)
  }, 1000)
  if (streamDuration && liveSessionStartedAt !== null) {
    streamDuration.textContent = formatStreamDuration(Date.now() - liveSessionStartedAt)
  }
}

function updateStreamInfo(isLive: boolean): void {
  syncStreamInfoMeta()
  if (streamLivePill) {
    streamLivePill.dataset.live = isLive ? 'true' : 'false'
    streamLivePill.textContent = isLive ? 'Live' : 'Offline'
  }
  if (streamViewers) {
    streamViewers.textContent = isLive ? 'Viewers: N/A' : '—'
    streamViewers.title = isLive
      ? 'Viewer count is not available in the desktop app yet'
      : ''
  }
  setLiveDurationClock(isLive)
}

void initSystemAudioCapture()

audioDesktopLabel.addEventListener('click', () => {
  if (!systemAudioCaptureSupported(capturePlatform)) return
  desktopAudioMuted = !desktopAudioMuted
  applyDesktopGameAudioTrackEnabled()
  syncWhipAvTracks()
  syncSystemAudioChannelUi()
})

audioGameLabel.addEventListener('click', () => {
  if (!systemAudioCaptureSupported(capturePlatform)) return
  if (!gameAudioStream) return
  gameAudioMuted = !gameAudioMuted
  applyDesktopGameAudioTrackEnabled()
  syncWhipAvTracks()
  syncSystemAudioChannelUi()
})

btnDesktopAudioSettings.addEventListener('click', () => {
  if (!systemAudioCaptureSupported(capturePlatform)) return
  const show = desktopAudioOutputSelect.hidden
  desktopAudioOutputSelect.hidden = !show
  btnDesktopAudioSettings.setAttribute('aria-expanded', show ? 'true' : 'false')
  if (show) void refreshDesktopAudioOutputDevices()
})

desktopAudioOutputSelect.addEventListener('change', () => {
  preferredDesktopOutputDeviceId = desktopAudioOutputSelect.value
  void window.tabcast.setSettings({
    preferredDesktopAudioOutputDeviceId: preferredDesktopOutputDeviceId,
  })
  void refreshDesktopAudioCapture()
})

btnGameAudioSettings.addEventListener('click', () => {
  if (!systemAudioCaptureSupported(capturePlatform)) return
  if (!selectedSourceId || captureKind !== 'desktop') {
    setDestError('Select a display or window under Gameplay to link game audio.')
    return
  }
  void refreshGameAudioCapture()
  studioSourceGame.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

// Initialize stream info
highlightSceneSelection(activeSceneTemplateId)
syncChatSourceRow()
syncSceneProgramPresentation()
syncOverlaySourceRow()
refreshProgramPreviewLayout()
updateGoLiveLabel(false)
updateStreamInfo(false)

void window.tabcast.getRelay().then(renderRelay)
