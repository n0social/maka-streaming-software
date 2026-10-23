import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { addonFolderName, isValidAddonId } from '../shared/addon-api'
import { KICK_RTMP_URL } from '../shared/stream-keys'

export type AddonSettings = {
  /** Discord channel webhook URL for live.start / live.end notifications. */
  discordWebhookUrl?: string
  /** Custom RTMP ingest URL (Kick, Facebook, etc.) */
  customRtmpUrl?: string
  customRtmpKey?: string
  backupRtmpUrl?: string
  backupRtmpKey?: string
}

const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/i
const CUSTOM_RTMP_URL_RE = /^rtmps?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[\w./-]*)?$/i

function settingsPath(addonId: string): string {
  const dir = join(app.getPath('userData'), 'addons', addonFolderName(addonId))
  mkdirSync(dir, { recursive: true })
  return join(dir, 'settings.json')
}

export function coerceAddonSettings(raw: unknown): AddonSettings {
  if (!raw || typeof raw !== 'object') return {}
  const p = raw as Record<string, unknown>
  const out: AddonSettings = {}
  if (typeof p.discordWebhookUrl === 'string') {
    const url = p.discordWebhookUrl.trim().slice(0, 512)
    if (DISCORD_WEBHOOK_RE.test(url)) {
      out.discordWebhookUrl = url
    }
  }
  if (typeof p.customRtmpUrl === 'string') {
    const url = p.customRtmpUrl.trim().slice(0, 512)
    if (CUSTOM_RTMP_URL_RE.test(url)) {
      out.customRtmpUrl = url
    }
  }
  if (typeof p.customRtmpKey === 'string') {
    const key = p.customRtmpKey.trim().slice(0, 256)
    if (key.length >= 8) {
      out.customRtmpKey = key
    }
  }
  if (typeof p.backupRtmpUrl === 'string') {
    const url = p.backupRtmpUrl.trim().slice(0, 512)
    if (CUSTOM_RTMP_URL_RE.test(url)) {
      out.backupRtmpUrl = url
    }
  }
  if (typeof p.backupRtmpKey === 'string') {
    const key = p.backupRtmpKey.trim().slice(0, 256)
    if (key.length >= 8) {
      out.backupRtmpKey = key
    }
  }
  return out
}

export function loadAddonSettings(addonId: string): AddonSettings {
  if (!isValidAddonId(addonId)) return {}
  const path = settingsPath(addonId)
  if (!existsSync(path)) return {}
  try {
    return coerceAddonSettings(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return {}
  }
}

export function saveAddonSettings(addonId: string, partial: unknown): AddonSettings {
  if (!isValidAddonId(addonId)) return {}
  const merged = { ...loadAddonSettings(addonId), ...coerceAddonSettings(partial) }
  writeFileSync(settingsPath(addonId), `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  return merged
}

export function isValidDiscordWebhookUrl(url: string): boolean {
  return DISCORD_WEBHOOK_RE.test(url)
}

export function kickRtmpPreset(): { url: string } {
  return { url: KICK_RTMP_URL }
}
