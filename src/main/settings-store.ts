import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { EncodeProfileId } from '../shared/stream-encode-profiles'
import { coerceCustomScenes, type CustomScene } from '../shared/custom-scenes'
import { isSceneImageStorageKey } from '../shared/scene-images'
import {
  DEFAULT_STREAM_DESTINATIONS,
  type StreamDestinationSettings,
  coerceStreamDestinations,
} from '../shared/stream-destination-settings'
import { coerceSettings, isValidTabId, sanitizeSavedTabs } from './security'

export type StreamPlatformPreference = 'twitch' | 'youtube' | 'none'

export type VideoEncoderPreference = 'system' | 'hardware' | 'software'

export type GpuPreference = 'default' | 'discrete' | 'integrated'

export type AppSettings = {
  bitrateProfile: EncodeProfileId
  startupMode: 'studio' | 'browse'
  minimizeToTrayWhileLive: boolean
  openChatOnBrowse: boolean
  labMode: boolean
  autoCheckUpdatesOnStartup: boolean
  recordingSaveFolder: string
  lastStreamPlatform: StreamPlatformPreference
  preferredMicDeviceId: string
  audioMicBitrateKbps: number
  audioDesktopBitrateKbps: number
  videoEncoderPreference: VideoEncoderPreference
  gpuPreference: GpuPreference
  onboardingComplete: boolean
  setupWizardComplete: boolean
  /** Absolute paths to PNG/JPG scene backgrounds keyed by scene template id. */
  sceneImages: Partial<Record<string, string>>
  /** User-defined scenes (max three); ids `custom-1` … `custom-3`. */
  customScenes: CustomScene[]
  /** Twitch/YouTube enable flags and stream keys saved from the stats bar dialog. */
  streamDestinations: StreamDestinationSettings
}

export type SavedBrowseTab = {
  id: string
  title: string
  url: string
  pinned?: boolean
}

export type SessionState = {
  tabs: SavedBrowseTab[]
  activeTabId: string | null
}

const DEFAULT_SETTINGS: AppSettings = {
  bitrateProfile: '720p30',
  startupMode: 'studio',
  minimizeToTrayWhileLive: true,
  openChatOnBrowse: false,
  labMode: false,
  autoCheckUpdatesOnStartup: true,
  recordingSaveFolder: '',
  lastStreamPlatform: 'none',
  preferredMicDeviceId: '',
  audioMicBitrateKbps: 160,
  audioDesktopBitrateKbps: 160,
  videoEncoderPreference: 'system',
  gpuPreference: 'default',
  onboardingComplete: false,
  setupWizardComplete: false,
  sceneImages: {},
  customScenes: [],
  streamDestinations: { ...DEFAULT_STREAM_DESTINATIONS },
}

function storeDir(): string {
  const dir = join(app.getPath('userData'), 'store')
  mkdirSync(dir, { recursive: true })
  return dir
}

function readJson<T>(name: string, fallback: T): T {
  const path = join(storeDir(), name)
  if (!existsSync(path)) return fallback
  try {
    return { ...fallback, ...(JSON.parse(readFileSync(path, 'utf8')) as T) }
  } catch {
    return fallback
  }
}

function writeJson(name: string, value: unknown): void {
  writeFileSync(join(storeDir(), name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function loadSettings(): AppSettings {
  const raw = readJson<Partial<AppSettings>>('settings.json', {})
  return { ...DEFAULT_SETTINGS, ...coerceSettings(raw) }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const prev = loadSettings()
  let sceneImages = { ...prev.sceneImages }
  if (partial.sceneImages) {
    for (const [key, value] of Object.entries(partial.sceneImages)) {
      if (!isSceneImageStorageKey(key)) continue
      if (!value) delete sceneImages[key]
      else sceneImages[key] = value
    }
  }
  let customScenes = prev.customScenes
  if (partial.customScenes) {
    customScenes = coerceCustomScenes(partial.customScenes)
  }
  let streamDestinations = prev.streamDestinations
  if (partial.streamDestinations !== undefined) {
    streamDestinations = coerceStreamDestinations(partial.streamDestinations)
  }
  const next = { ...prev, ...partial, sceneImages, customScenes, streamDestinations }
  writeJson('settings.json', next)
  return next
}

export function loadSession(): SessionState {
  const raw = readJson<SessionState>('browse-session.json', { tabs: [], activeTabId: null })
  const tabs = sanitizeSavedTabs(Array.isArray(raw.tabs) ? raw.tabs : [])
  let activeTabId = isValidTabId(raw.activeTabId) ? raw.activeTabId : null
  if (activeTabId && !tabs.some((t) => t.id === activeTabId)) {
    activeTabId = tabs[0]?.id ?? null
  }
  return { tabs, activeTabId }
}

export function saveSession(session: SessionState): void {
  writeJson('browse-session.json', session)
}
