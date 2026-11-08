import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { addonFolderName, isValidAddonId, legacyAddonId, migrateAddonId } from '../shared/addon-api'
import { KICK_RTMP_URL } from '../shared/stream-keys'

export type AddonSettings = {
  /** Discord channel webhook URL for live.start / live.end notifications. */
  discordWebhookUrl?: string
  /** Custom RTMP ingest URL (Kick, Facebook, etc.) */
  customRtmpUrl?: string
  customRtmpKey?: string
  /** Optional TURN server for phone WebRTC when LAN ICE is insufficient. */
  turnUrl?: string
  turnUsername?: string
  turnCredential?: string
  backupRtmpUrl?: string
  backupRtmpKey?: string
}

const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/i
const CUSTOM_RTMP_URL_RE = /^rtmps?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[\w./-]*)?$/i
const TURN_URL_RE = /^turns?:[^\s]+$/i

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
  if (typeof p.turnUrl === 'string') {
    const url = p.turnUrl.trim().slice(0, 512)
    if (TURN_URL_RE.test(url)) {
      out.turnUrl = url
    }
  }
  if (typeof p.turnUsername === 'string') {
    const username = p.turnUsername.trim().slice(0, 256)
    if (username.length > 0) {
      out.turnUsername = username
    }
  }
  if (typeof p.turnCredential === 'string') {
    const credential = p.turnCredential.trim().slice(0, 256)
    if (credential.length > 0) {
      out.turnCredential = credential
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

function readSettingsFile(path: string): AddonSettings | null {
  if (!existsSync(path)) return null
  try {
    return coerceAddonSettings(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return null
  }
}

export function loadAddonSettings(addonId: string): AddonSettings {
  const id = migrateAddonId(addonId)
  if (!isValidAddonId(id)) return {}
  const path = settingsPath(id)
  const current = readSettingsFile(path)
  if (current) return current
  const legacyId = legacyAddonId(id)
  if (!legacyId) return {}
  const legacy = readSettingsFile(settingsPath(legacyId))
  if (!legacy) return {}
  writeFileSync(path, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8')
  return legacy
}

export function saveAddonSettings(addonId: string, partial: unknown): AddonSettings {
  const id = migrateAddonId(addonId)
  if (!isValidAddonId(id)) return {}
  const merged = { ...loadAddonSettings(id), ...coerceAddonSettings(partial) }
  writeFileSync(settingsPath(id), `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  return merged
}

export function isValidDiscordWebhookUrl(url: string): boolean {
  return DISCORD_WEBHOOK_RE.test(url)
}

export function kickRtmpPreset(): { url: string } {
  return { url: KICK_RTMP_URL }
}
