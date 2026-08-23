import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export type AppSettings = {
  bitrateProfile: '720p' | '1080p'
  startupMode: 'studio' | 'browse'
  minimizeToTrayWhileLive: boolean
  openChatOnBrowse: boolean
  labMode: boolean
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
  bitrateProfile: '720p',
  startupMode: 'studio',
  minimizeToTrayWhileLive: true,
  openChatOnBrowse: false,
  labMode: false,
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
  return readJson<AppSettings>('settings.json', { ...DEFAULT_SETTINGS })
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...partial }
  writeJson('settings.json', next)
  return next
}

export function loadSession(): SessionState {
  return readJson<SessionState>('browse-session.json', { tabs: [], activeTabId: null })
}

export function saveSession(session: SessionState): void {
  writeJson('browse-session.json', session)
}
