import { encodeProfileSpec, normalizeEncodeProfileId, type EncodeProfileId } from './stream-encode-profiles'
import { normalizeStreamKey } from './stream-keys'
import type { RelayConfigRequest, StreamProfile } from './tabcast'

export type VideoEncoderPreference = 'system' | 'hardware' | 'software'

export type RelayIngestInput = {
  twitchKey?: string
  youtubeKey?: string
  customRtmpUrl?: string
  customRtmpKey?: string
}

export type RelayStudioSettings = {
  streamTitle: string
  streamCategory: string
  audioMicBitrateKbps: number
  audioDesktopBitrateKbps: number
  videoEncoderPreference: VideoEncoderPreference
  gpuPreference: string
}

export function sanitizeStreamTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 140)
}

export function sanitizeStreamCategory(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 100)
}

export function buildRelayConfigRequest(
  ingest: RelayIngestInput,
  profileRaw: StreamProfile | EncodeProfileId,
  studio: RelayStudioSettings,
): RelayConfigRequest {
  const profile = normalizeEncodeProfileId(profileRaw)
  const spec = encodeProfileSpec(profile)
  const body: RelayConfigRequest = {
    profile,
    bitrateMbps: spec.bitrateMbps,
  }

  const twitch = normalizeStreamKey(ingest.twitchKey ?? '')
  const youtube = normalizeStreamKey(ingest.youtubeKey ?? '')
  const customKey = normalizeStreamKey(ingest.customRtmpKey ?? '')
  const customUrl = (ingest.customRtmpUrl ?? '').trim()
  if (twitch) body.twitchKey = twitch
  if (youtube) body.youtubeKey = youtube
  if (customUrl && customKey) {
    body.customRtmpUrl = customUrl
    body.customRtmpKey = customKey
  }

  const title = sanitizeStreamTitle(studio.streamTitle)
  const category = sanitizeStreamCategory(studio.streamCategory)
  if (title) body.streamTitle = title
  if (category) body.streamCategory = category

  if (Number.isFinite(studio.audioMicBitrateKbps)) {
    body.audioMicBitrateKbps = Math.round(studio.audioMicBitrateKbps)
  }
  if (Number.isFinite(studio.audioDesktopBitrateKbps)) {
    body.audioDesktopBitrateKbps = Math.round(studio.audioDesktopBitrateKbps)
  }

  body.videoEncoderPreference = studio.videoEncoderPreference
  if (studio.gpuPreference) body.gpuPreference = studio.gpuPreference

  return body
}
