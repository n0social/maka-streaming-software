import { contextBridge, ipcRenderer } from 'electron'
import type { RelaySnapshot } from '../shared/relay-snapshot'
import type { PhoneIceServer } from '../shared/phone-ice-servers'
import type { PhonePairSnapshot, PhoneWebRtcSessionDescription } from '../shared/phone-pair'
import type { EncodeProfileId } from '../shared/stream-encode-profiles'
import type { StreamDestinationSettings } from '../shared/stream-destination-settings'
export type WorkspaceMode = 'studio' | 'browse'
export type AppMode = WorkspaceMode | 'settings'

export type CaptureSource = {
  id: string
  name: string
  type: 'screen' | 'window' | 'browser'
  thumbnailDataUrl: string
}

export type BrowserState = {
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
}

export type BrowseTabInfo = {
  id: string
  title: string
  url: string
  pinned: boolean
  active: boolean
}

export type StreamPlatformPreference = 'twitch' | 'youtube' | 'none'
export type VideoEncoderPreference = 'system' | 'hardware' | 'software'
export type GpuPreference = 'default' | 'discrete' | 'integrated'

export type AppSettings = {
  bitrateProfile: EncodeProfileId
  startupMode: WorkspaceMode
  minimizeToTrayWhileLive: boolean
  openChatOnBrowse: boolean
  labMode: boolean
  autoCheckUpdatesOnStartup: boolean
  recordingSaveFolder: string
  settingsActiveTab:
    | 'general'
    | 'streaming'
    | 'audio'
    | 'video'
    | 'recording'
    | 'modes'
    | 'help'
  lastStreamPlatform: StreamPlatformPreference
  preferredMicDeviceId: string
  preferredDesktopAudioOutputDeviceId: string
  audioMicBitrateKbps: number
  audioDesktopBitrateKbps: number
  videoEncoderPreference: VideoEncoderPreference
  gpuPreference: GpuPreference
  onboardingComplete: boolean
  setupWizardComplete: boolean
  sceneImages: Partial<Record<string, string>>
  customScenes: Array<{ id: string; name: string }>
  streamDestinations: StreamDestinationSettings
}

export type AppVersionInfo = {
  appVersion: string
  relayVersion: string | null
  platform: string
}

export type GpuOption = {
  id: string
  label: string
}

export type PickRecordingFolderResult =
  | { canceled: true }
  | { canceled: false; path: string }

export type SaveRecordingResult =
  | { canceled: true }
  | { canceled: false; filePath: string }

export type PickSceneImageResult =
  | { canceled: true }
  | { canceled: false; path: string; dataUrl: string }

export type UpdateStatus = {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  progress?: number
  message?: string
}

export type DiagEvent = {
  id: string
  at: string
  level: 'info' | 'warn' | 'error' | 'fatal'
  source: string
  message: string
  stack?: string
  detail?: Record<string, unknown>
}

export type AddonPanel = {
  addonId: string
  title: string
  description?: string
  runtimeUrl?: string
  actions: Array<{ id: string; label: string; description?: string }>
}

export type AddonActionResult = {
  ok: boolean
  message?: string
  sceneLayout?: unknown
  openUrl?: string
}

export type MarketplaceItem = {
  catalogId: string
  id: string
  name: string
  version: string
  author?: string
  description?: string
  category?: string
  permissions: string[]
  featured: boolean
  builtin: boolean
  installed: boolean
  enabled: boolean
}

export type AddonInstallResult = {
  ok: boolean
  message?: string
}

export type AddonSettingsSnapshot = {
  discordWebhookUrl?: string
  customRtmpUrl?: string
  customRtmpKeyConfigured?: boolean
  turnUrl?: string
  turnUsername?: string
  turnCredentialConfigured?: boolean
  backupRtmpUrl?: string
  backupRtmpKeyConfigured?: boolean
}

export type AddonLiveEventResult = {
  addonId: string
  ok: boolean
  message?: string
}

export type VerifyReport = {
  ok: boolean
  checks: Array<{ name: string; ok: boolean; detail: string }>
  snapshot: RelaySnapshot
  diagnostics: DiagEvent[]
}

export type TabcastBridge = {
  getRelay: () => Promise<RelaySnapshot>
  startRelay: () => Promise<RelaySnapshot>
  stopRelay: () => Promise<RelaySnapshot>
  refreshRelay: () => Promise<RelaySnapshot>
  onRelayUpdate: (cb: (snapshot: RelaySnapshot) => void) => () => void
  getMode: () => Promise<AppMode>
  getWorkspaceMode: () => Promise<WorkspaceMode>
  setMode: (mode: AppMode) => Promise<AppMode>
  exitSettingsMode: () => Promise<AppMode>
  onMode: (cb: (mode: AppMode) => void) => () => void
  getVersionInfo: () => Promise<AppVersionInfo>
  listGpuOptions: () => Promise<GpuOption[]>
  pickRecordingFolder: () => Promise<PickRecordingFolderResult>
  navigate: (url: string) => Promise<string | null>
  back: () => Promise<void>
  forward: () => Promise<void>
  reload: () => Promise<void>
  getBrowserState: () => Promise<BrowserState | null>
  onNavigated: (cb: (state: BrowserState) => void) => () => void
  onTitle: (cb: (title: string) => void) => () => void
  listCaptureSources: () => Promise<CaptureSource[]>
  getBrowseCaptureTarget: () => Promise<{ mediaSourceId: string; title: string; url: string } | null>
  setBrowseCaptureActive: (active: boolean) => Promise<boolean>
  listAddonPanels: () => Promise<AddonPanel[]>
  listMarketplace: () => Promise<MarketplaceItem[]>
  refreshMarketplace: () => Promise<MarketplaceItem[]>
  installAddon: (catalogId: string) => Promise<AddonInstallResult>
  uninstallAddon: (addonId: string) => Promise<AddonInstallResult>
  setAddonEnabled: (addonId: string, enabled: boolean) => Promise<AddonInstallResult>
  reloadAddons: () => Promise<boolean>
  getAddonPreloadPath: () => Promise<string>
  onAddonStudioToast: (cb: (message: string) => void) => () => void
  getAddonSettings: (addonId: string) => Promise<AddonSettingsSnapshot>
  setAddonSettings: (
    addonId: string,
    partial: {
      discordWebhookUrl?: string
      customRtmpUrl?: string
      customRtmpKey?: string
      turnUrl?: string
      turnUsername?: string
      turnCredential?: string
      backupRtmpUrl?: string
      backupRtmpKey?: string
    },
  ) => Promise<AddonInstallResult>
  dispatchAddonLiveEvent: (
    event: 'live.start' | 'live.end',
    ctx: {
      profile: EncodeProfileId
      platforms?: { twitch?: boolean; youtube?: boolean; custom?: boolean }
    },
  ) => Promise<AddonLiveEventResult[]>
  runAddonAction: (
    addonId: string,
    actionId: string,
    ctx: { profile: EncodeProfileId; hasWebcam: boolean },
  ) => Promise<AddonActionResult>
  revealRelay: () => Promise<string>
  listDiagnostics: () => Promise<DiagEvent[]>
  clearDiagnostics: () => Promise<DiagEvent[]>
  exportDiagnostics: () => Promise<string>
  verifySystem: () => Promise<VerifyReport>
  onDiagnostic: (cb: (event: DiagEvent) => void) => () => void
  listTabs: () => Promise<BrowseTabInfo[]>
  newTab: (url?: string) => Promise<BrowseTabInfo | null>
  activateTab: (id: string) => Promise<BrowseTabInfo[]>
  closeTab: (id: string) => Promise<BrowseTabInfo[]>
  openPinned: (presetId: string) => Promise<BrowseTabInfo[]>
  onTabs: (cb: (tabs: BrowseTabInfo[]) => void) => () => void
  popoutChat: (url?: string) => Promise<void>
  getSettings: () => Promise<AppSettings>
  setSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  openExternal: (url: string) => Promise<void>
  pickSceneImageFile: () => Promise<PickSceneImageResult>
  readSceneImageDataUrl: (filePath: string) => Promise<string | null>
  saveRecording: (payload: {
    data: ArrayBuffer
    defaultName: string
    ext: 'webm' | 'mp4'
    /** When true, show the save dialog even if a default folder is configured. */
    forceDialog?: boolean
  }) => Promise<SaveRecordingResult>
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<boolean>
  windowClose: () => Promise<void>
  openStream: () => Promise<void>
  openHome: () => Promise<void>
  onPrepareQuit: (cb: () => void) => () => void
  ackPrepareQuit: () => void
  getUpdateStatus: () => Promise<UpdateStatus>
  checkForUpdates: () => Promise<UpdateStatus>
  downloadUpdate: () => Promise<UpdateStatus>
  installUpdate: () => Promise<void>
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void
  getPhonePair: () => Promise<PhonePairSnapshot>
  onPhonePairUpdate: (cb: (snapshot: PhonePairSnapshot) => void) => () => void
  onPhoneWebrtcOffer: (cb: (offer: PhoneWebRtcSessionDescription) => void) => () => void
  onPhoneWebrtcReset: (cb: () => void) => () => void
  submitPhoneWebrtcAnswer: (answer: PhoneWebRtcSessionDescription) => Promise<{ ok: boolean }>
  getPhoneWebRtcIceServers: () => Promise<PhoneIceServer[]>
}

const api: TabcastBridge = {
  getRelay: () => ipcRenderer.invoke('relay:get'),
  startRelay: () => ipcRenderer.invoke('relay:start'),
  stopRelay: () => ipcRenderer.invoke('relay:stop'),
  refreshRelay: () => ipcRenderer.invoke('relay:refresh'),
  onRelayUpdate: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: RelaySnapshot) => cb(snapshot)
    ipcRenderer.on('relay:update', handler)
    return () => ipcRenderer.removeListener('relay:update', handler)
  },
  getMode: () => ipcRenderer.invoke('app:get-mode'),
  getWorkspaceMode: () => ipcRenderer.invoke('app:get-workspace-mode'),
  setMode: (mode) => ipcRenderer.invoke('app:set-mode', mode),
  exitSettingsMode: () => ipcRenderer.invoke('app:exit-settings'),
  getVersionInfo: () => ipcRenderer.invoke('app:get-version-info'),
  listGpuOptions: () => ipcRenderer.invoke('system:list-gpu-options'),
  pickRecordingFolder: () => ipcRenderer.invoke('recording:pick-folder'),
  onMode: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, mode: AppMode) => cb(mode)
    ipcRenderer.on('app:mode', handler)
    return () => ipcRenderer.removeListener('app:mode', handler)
  },
  navigate: (url) => ipcRenderer.invoke('browser:navigate', url),
  back: () => ipcRenderer.invoke('browser:back'),
  forward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  getBrowserState: () => ipcRenderer.invoke('browser:state'),
  onNavigated: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, state: BrowserState) => cb(state)
    ipcRenderer.on('browser:navigated', handler)
    return () => ipcRenderer.removeListener('browser:navigated', handler)
  },
  onTitle: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, title: string) => cb(title)
    ipcRenderer.on('browser:title', handler)
    return () => ipcRenderer.removeListener('browser:title', handler)
  },
  listCaptureSources: () => ipcRenderer.invoke('capture:list-sources'),
  getBrowseCaptureTarget: () => ipcRenderer.invoke('capture:get-browse-target'),
  setBrowseCaptureActive: (active) => ipcRenderer.invoke('capture:set-browse-capture-active', active),
  listAddonPanels: () => ipcRenderer.invoke('addons:list-panels'),
  listMarketplace: () => ipcRenderer.invoke('addons:list-marketplace'),
  refreshMarketplace: () => ipcRenderer.invoke('addons:refresh-marketplace'),
  installAddon: (catalogId) => ipcRenderer.invoke('addons:install', catalogId),
  uninstallAddon: (addonId) => ipcRenderer.invoke('addons:uninstall', addonId),
  setAddonEnabled: (addonId, enabled) => ipcRenderer.invoke('addons:set-enabled', addonId, enabled),
  reloadAddons: () => ipcRenderer.invoke('addons:reload'),
  getAddonPreloadPath: () => ipcRenderer.invoke('addons:get-preload-path'),
  onAddonStudioToast: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) => cb(message)
    ipcRenderer.on('addon-runtime:studio-toast', handler)
    return () => ipcRenderer.removeListener('addon-runtime:studio-toast', handler)
  },
  getAddonSettings: (addonId) => ipcRenderer.invoke('addons:get-settings', addonId),
  setAddonSettings: (addonId, partial) => ipcRenderer.invoke('addons:set-settings', addonId, partial),
  dispatchAddonLiveEvent: (event, ctx) =>
    ipcRenderer.invoke('addons:dispatch-live-event', event, ctx),
  runAddonAction: (addonId, actionId, ctx) =>
    ipcRenderer.invoke('addons:run-action', addonId, actionId, ctx),
  revealRelay: () => ipcRenderer.invoke('relay:reveal'),
  listDiagnostics: () => ipcRenderer.invoke('diagnostics:list'),
  clearDiagnostics: () => ipcRenderer.invoke('diagnostics:clear'),
  exportDiagnostics: () => ipcRenderer.invoke('diagnostics:export'),
  verifySystem: () => ipcRenderer.invoke('diagnostics:verify'),
  onDiagnostic: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, event: DiagEvent) => cb(event)
    ipcRenderer.on('diagnostics:event', handler)
    return () => ipcRenderer.removeListener('diagnostics:event', handler)
  },
  listTabs: () => ipcRenderer.invoke('browser:tabs'),
  newTab: (url) => ipcRenderer.invoke('browser:new-tab', url),
  activateTab: (id) => ipcRenderer.invoke('browser:activate-tab', id),
  closeTab: (id) => ipcRenderer.invoke('browser:close-tab', id),
  openPinned: (presetId) => ipcRenderer.invoke('browser:open-pinned', presetId),
  onTabs: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, tabs: BrowseTabInfo[]) => cb(tabs)
    ipcRenderer.on('browser:tabs', handler)
    return () => ipcRenderer.removeListener('browser:tabs', handler)
  },
  popoutChat: (url) => ipcRenderer.invoke('browser:popout-chat', url),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  pickSceneImageFile: () => ipcRenderer.invoke('scene:pick-image'),
  readSceneImageDataUrl: (filePath) => ipcRenderer.invoke('scene:read-image-data-url', filePath),
  saveRecording: (payload) => ipcRenderer.invoke('recording:save', payload),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  openStream: () => ipcRenderer.invoke('shell:open-stream'),
  openHome: () => ipcRenderer.invoke('shell:open-home'),
  onPrepareQuit: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('app:prepare-quit', handler)
    return () => ipcRenderer.removeListener('app:prepare-quit', handler)
  },
  ackPrepareQuit: () => {
    ipcRenderer.send('app:prepare-quit-done')
  },
  getUpdateStatus: () => ipcRenderer.invoke('app:update-status'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),
  downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  onUpdateStatus: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => cb(status)
    ipcRenderer.on('app:update-status', handler)
    return () => ipcRenderer.removeListener('app:update-status', handler)
  },
  getPhonePair: () => ipcRenderer.invoke('phone-pair:get'),
  onPhonePairUpdate: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: PhonePairSnapshot) => cb(snapshot)
    ipcRenderer.on('phone-pair:update', handler)
    return () => ipcRenderer.removeListener('phone-pair:update', handler)
  },
  onPhoneWebrtcOffer: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, offer: PhoneWebRtcSessionDescription) => cb(offer)
    ipcRenderer.on('phone-pair:webrtc-offer', handler)
    return () => ipcRenderer.removeListener('phone-pair:webrtc-offer', handler)
  },
  onPhoneWebrtcReset: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('phone-pair:webrtc-reset', handler)
    return () => ipcRenderer.removeListener('phone-pair:webrtc-reset', handler)
  },
  submitPhoneWebrtcAnswer: (answer) => ipcRenderer.invoke('phone-pair:webrtc-answer', answer),
  getPhoneWebRtcIceServers: () => ipcRenderer.invoke('phone-pair:ice-servers'),
}

contextBridge.exposeInMainWorld('tabcast', api)
