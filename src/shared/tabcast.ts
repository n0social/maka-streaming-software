/** Shared constants matching the local Tabcast relay contract (localhost only). */

import {
  DEFAULT_ENCODE_PROFILE,
  ENCODE_PROFILE_ORDER,
  type EncodeProfileId,
} from './stream-encode-profiles'

export type StreamProfile = EncodeProfileId

export const STREAM_PROFILES: StreamProfile[] = ENCODE_PROFILE_ORDER
export const DEFAULT_STREAM_PROFILE: StreamProfile = DEFAULT_ENCODE_PROFILE

export const RELAY_DEFAULT_PORT = 38_473
export const RELAY_BASE_URL = `http://127.0.0.1:${RELAY_DEFAULT_PORT}`
export const RELAY_HEALTH_PATH = '/health'
export const RELAY_CONFIG_PATH = '/config'
export const RELAY_VERIFY_PATH = '/config/verify'
export const RELAY_STATUS_PATH = '/status'
export const RELAY_STOP_PATH = '/stop'
export const RELAY_WHIP_PATH = '/whip'
export const RELAY_SCENE_PATH = '/scene'
export const RELAY_WHIP_URL = `${RELAY_BASE_URL}${RELAY_WHIP_PATH}`

/** WHIP msid stream IDs — relay maps tracks to scene sources. */
export const RELAY_TRACK_STREAM_IDS = {
  gameplay: 'gameplay',
  browser: 'browser',
  webcam: 'webcam',
  mic: 'mic',
  desktopAudio: 'desktop-audio',
  gameAudio: 'game-audio',
} as const

export type RelayTrackStreamId =
  (typeof RELAY_TRACK_STREAM_IDS)[keyof typeof RELAY_TRACK_STREAM_IDS]

export type RelayConfigRequest = {
  twitchKey?: string
  youtubeKey?: string
  /** Custom RTMP ingest (Kick, Facebook Live, etc.) — relay v0.1.1+ */
  customRtmpUrl?: string
  customRtmpKey?: string
  profile: StreamProfile
  bitrateMbps?: number
}

export type RelayVerifyResponse = {
  ok: boolean
  twitch?: { ok: boolean; message?: string }
  youtube?: { ok: boolean; message?: string }
  custom?: { ok: boolean; message?: string }
  message?: string
}

export type SceneSourceType = 'video' | 'audio' | 'overlay'

export type SceneSource = {
  id: string
  type: SceneSourceType
  label?: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  /** Local image path for static scene backgrounds (relay may ignore until compositing supports it). */
  assetPath?: string
  assetMime?: 'image/png' | 'image/jpeg'
}

export type SceneLayout = {
  canvas: { width: number; height: number }
  sources: SceneSource[]
}

export type RelayLifecycle = 'stopped' | 'starting' | 'ready' | 'live' | 'error'

export type RelayHealth = {
  ok: true
  version: string
  /** Always rewritten to local WHIP in the browser app. */
  streamUrl: string
  relayToken: string
}

export type RelayStatusResponse = {
  status: 'idle' | 'starting' | 'live' | 'error'
  profile?: StreamProfile
  platforms?: { twitch?: boolean; youtube?: boolean; custom?: boolean }
  whipSessionActive?: boolean
  error?: string
  ffmpegLog?: string[]
}

/** Hosts that belong to the old web/portfolio surface — never open these. */
export const BLOCKED_HOST_SUFFIXES = ['skydav.work', 'skydav.com'] as const

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return BLOCKED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  )
}

/** Normalize relay health so the UI never surfaces remote marketing URLs. */
export function localizeRelayHealth(health: RelayHealth): RelayHealth {
  return {
    ...health,
    streamUrl: RELAY_WHIP_URL,
  }
}
