import { coerceCustomScenes } from '../shared/custom-scenes'
import { coerceStreamDestinations } from '../shared/stream-destination-settings'
import type { AppSettings, SavedBrowseTab } from './settings-store'
import { normalizeBrowseUrl } from '../shared/browse-url'
import { isEncodeProfileId } from '../shared/stream-encode-profiles'
import { coerceSceneImagesRecord } from './scene-image-io'

const TAB_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/
const PRESET_IDS = new Set(['pin-twitch', 'pin-yt-studio', 'pin-yt-chat', 'pin-chat'])

/** Permissions granted to the studio renderer for capture. */
export const STUDIO_MEDIA_PERMISSIONS = new Set([
  'media',
  'mediaKeySystem',
  'notifications',
  'display-capture',
])

export function isStudioMediaPermission(permission: string): boolean {
  return STUDIO_MEDIA_PERMISSIONS.has(permission)
}

export function coerceSettings(partial: unknown): Partial<AppSettings> {
  if (!partial || typeof partial !== 'object') return {}
  const p = partial as Record<string, unknown>
  const out: Partial<AppSettings> = {}

  if (typeof p.bitrateProfile === 'string' && isEncodeProfileId(p.bitrateProfile)) {
    out.bitrateProfile = p.bitrateProfile
  } else if (p.bitrateProfile === '720p') {
    out.bitrateProfile = '720p30'
  } else if (p.bitrateProfile === '1080p') {
    out.bitrateProfile = '1080p60'
  }
  if (p.startupMode === 'studio' || p.startupMode === 'browse') {
    out.startupMode = p.startupMode
  }
  if (typeof p.minimizeToTrayWhileLive === 'boolean') {
    out.minimizeToTrayWhileLive = p.minimizeToTrayWhileLive
  }
  if (typeof p.openChatOnBrowse === 'boolean') {
    out.openChatOnBrowse = p.openChatOnBrowse
  }
  if (typeof p.labMode === 'boolean') {
    out.labMode = p.labMode
  }
  if (typeof p.autoCheckUpdatesOnStartup === 'boolean') {
    out.autoCheckUpdatesOnStartup = p.autoCheckUpdatesOnStartup
  }
  if (typeof p.recordingSaveFolder === 'string') {
    const folder = p.recordingSaveFolder.trim()
    out.recordingSaveFolder = folder.length <= 4096 ? folder : folder.slice(0, 4096)
  }
  if (p.lastStreamPlatform === 'twitch' || p.lastStreamPlatform === 'youtube' || p.lastStreamPlatform === 'none') {
    out.lastStreamPlatform = p.lastStreamPlatform
  }
  if (typeof p.preferredMicDeviceId === 'string') {
    const id = p.preferredMicDeviceId.trim()
    out.preferredMicDeviceId = id.length <= 512 ? id : id.slice(0, 512)
  }
  if (typeof p.audioMicBitrateKbps === 'number' && Number.isFinite(p.audioMicBitrateKbps)) {
    out.audioMicBitrateKbps = Math.min(320, Math.max(64, Math.round(p.audioMicBitrateKbps)))
  }
  if (typeof p.audioDesktopBitrateKbps === 'number' && Number.isFinite(p.audioDesktopBitrateKbps)) {
    out.audioDesktopBitrateKbps = Math.min(320, Math.max(64, Math.round(p.audioDesktopBitrateKbps)))
  }
  if (p.videoEncoderPreference === 'system' || p.videoEncoderPreference === 'hardware' || p.videoEncoderPreference === 'software') {
    out.videoEncoderPreference = p.videoEncoderPreference
  }
  if (p.gpuPreference === 'default' || p.gpuPreference === 'discrete' || p.gpuPreference === 'integrated') {
    out.gpuPreference = p.gpuPreference
  }
  if (typeof p.onboardingComplete === 'boolean') {
    out.onboardingComplete = p.onboardingComplete
  }
  if (typeof p.setupWizardComplete === 'boolean') {
    out.setupWizardComplete = p.setupWizardComplete
  }
  if (p.sceneImages !== undefined) {
    out.sceneImages = coerceSceneImagesRecord(p.sceneImages)
  }
  if (p.customScenes !== undefined) {
    out.customScenes = coerceCustomScenes(p.customScenes)
  }
  if (p.streamDestinations !== undefined) {
    out.streamDestinations = coerceStreamDestinations(p.streamDestinations)
  }

  return out
}

export function isValidTabId(id: unknown): id is string {
  return typeof id === 'string' && TAB_ID_RE.test(id)
}

export function isValidPresetId(id: unknown): id is string {
  return typeof id === 'string' && PRESET_IDS.has(id)
}

/** Drop blocked or malformed URLs from persisted browse session. */
export function sanitizeSavedTabs(tabs: SavedBrowseTab[]): SavedBrowseTab[] {
  const out: SavedBrowseTab[] = []
  for (const tab of tabs) {
    if (!tab || typeof tab !== 'object') continue
    const id = typeof tab.id === 'string' ? tab.id : ''
    if (!TAB_ID_RE.test(id)) continue
    const url = normalizeBrowseUrl(String(tab.url || ''))
    if (!url) continue
    out.push({
      id,
      title: typeof tab.title === 'string' ? tab.title.slice(0, 200) : 'Tab',
      url,
      pinned: Boolean(tab.pinned),
    })
  }
  return out
}
