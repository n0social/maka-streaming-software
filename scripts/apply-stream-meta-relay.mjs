#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

function patch(file, pairs) {
  const path = join(root, file)
  let text = readFileSync(path, 'utf8')
  for (const [old, new_] of pairs) {
    if (!text.includes(old)) {
      throw new Error(`${file}: missing fragment:\n${old.slice(0, 120)}`)
    }
    text = text.replace(old, new_)
  }
  writeFileSync(path, text)
}

writeFileSync(
  join(root, 'src/shared/relay-config.ts'),
  readFileSync(join(import.meta.dirname, 'relay-config.ts.snippet'), 'utf8'),
)

patch('src/shared/tabcast.ts', [
  [
    `export type RelayConfigRequest = {
  twitchKey?: string
  youtubeKey?: string
  /** Custom RTMP ingest (Kick, Facebook Live, etc.) — relay v0.1.1+ */
  customRtmpUrl?: string
  customRtmpKey?: string
  profile: StreamProfile
  bitrateMbps?: number
}`,
    `/** POST /config body — see src/shared/relay-config.ts. v0.1.0 relay uses profile + keys only. */
export type RelayConfigRequest = {
  twitchKey?: string
  youtubeKey?: string
  /** Custom RTMP ingest (Kick, Facebook Live, etc.) — relay v0.1.1+ */
  customRtmpUrl?: string
  customRtmpKey?: string
  profile: StreamProfile
  bitrateMbps?: number
  streamTitle?: string
  streamCategory?: string
  audioMicBitrateKbps?: number
  audioDesktopBitrateKbps?: number
  videoEncoderPreference?: 'system' | 'hardware' | 'software'
  gpuPreference?: string
}`,
  ],
])

patch('src/renderer/relay-client.ts', [
  [
    `import { encodeProfileSpec, normalizeEncodeProfileId } from '../shared/stream-encode-profiles'
import {
  DEFAULT_STREAM_PROFILE,
  RELAY_BASE_URL,`,
    `import { normalizeEncodeProfileId } from '../shared/stream-encode-profiles'
import {
  RELAY_BASE_URL,`,
  ],
  [
    `} from '../shared/tabcast'
import { normalizeStreamKey } from '../shared/stream-keys'
`,
    `} from '../shared/tabcast'
`,
  ],
  [
    `export async function postRelayConfig(
  health: RelayHealth,
  input: {
    twitchKey?: string
    youtubeKey?: string
    customRtmpUrl?: string
    customRtmpKey?: string
    profile: StreamProfile
  },
): Promise<void> {
  const profile = normalizeEncodeProfileId(input.profile || DEFAULT_STREAM_PROFILE)
  const spec = encodeProfileSpec(profile)
  const body: RelayConfigRequest = {
    profile,
    bitrateMbps: spec.bitrateMbps,
  }
  const twitch = normalizeStreamKey(input.twitchKey ?? '')
  const youtube = normalizeStreamKey(input.youtubeKey ?? '')
  const customKey = normalizeStreamKey(input.customRtmpKey ?? '')
  const customUrl = (input.customRtmpUrl ?? '').trim()
  if (twitch) body.twitchKey = twitch
  if (youtube) body.youtubeKey = youtube
  if (customUrl && customKey) {
    body.customRtmpUrl = customUrl
    body.customRtmpKey = customKey
  }

  const res = await relayFetch(\`\${RELAY_BASE_URL}\${RELAY_CONFIG_PATH}\`, {`,
    `export async function postRelayConfig(
  health: RelayHealth,
  body: RelayConfigRequest,
): Promise<void> {
  const res = await relayFetch(\`\${RELAY_BASE_URL}\${RELAY_CONFIG_PATH}\`, {`,
  ],
])

for (const f of ['src/main/settings-store.ts', 'src/preload/index.ts']) {
  patch(f, [
    [
      `  lastStreamPlatform: StreamPlatformPreference
  preferredMicDeviceId: string`,
      `  lastStreamPlatform: StreamPlatformPreference
  streamTitle: string
  streamCategory: string
  preferredMicDeviceId: string`,
    ],
  ])
}
patch('src/main/settings-store.ts', [
  [
    `  lastStreamPlatform: 'none',
  preferredMicDeviceId: '',`,
    `  lastStreamPlatform: 'none',
  streamTitle: '',
  streamCategory: '',
  preferredMicDeviceId: '',`,
  ],
])

patch('src/main/security.ts', [
  [
    `  if (p.lastStreamPlatform === 'twitch' || p.lastStreamPlatform === 'youtube' || p.lastStreamPlatform === 'none') {
    out.lastStreamPlatform = p.lastStreamPlatform
  }
`,
    `  if (p.lastStreamPlatform === 'twitch' || p.lastStreamPlatform === 'youtube' || p.lastStreamPlatform === 'none') {
    out.lastStreamPlatform = p.lastStreamPlatform
  }
  if (typeof p.streamTitle === 'string') {
    out.streamTitle = p.streamTitle.trim().replace(/\\s+/g, ' ').slice(0, 140)
  }
  if (typeof p.streamCategory === 'string') {
    out.streamCategory = p.streamCategory.trim().replace(/\\s+/g, ' ').slice(0, 100)
  }
`,
  ],
  [
    `  if (p.gpuPreference === 'default' || p.gpuPreference === 'discrete' || p.gpuPreference === 'integrated') {
    out.gpuPreference = p.gpuPreference
  }`,
    `  if (typeof p.gpuPreference === 'string') {
    const gpu = p.gpuPreference.trim()
    if (gpu === 'default' || gpu === 'discrete' || gpu === 'integrated' || /^gpu-\\d+$/.test(gpu)) {
      out.gpuPreference = gpu
    }
  }`,
  ],
])

console.log('apply-stream-meta-relay: core OK')
