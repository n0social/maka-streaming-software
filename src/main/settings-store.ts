import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { EncodeProfileId } from '../shared/stream-encode-profiles'
import { coerceSettings, isValidTabId, sanitizeSavedTabs } from './security'

export type AppSettings = {
  bitrateProfile: EncodeProfileId
  startupMode: 'studio' | 'browse'
  minimizeToTrayWhileLive: boolean
  openChatOnBrowse: boolean
  labMode: boolean
  onboardingComplete: boolean
  setupWizardComplete: boolean
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
  onboardingComplete: false,
  setupWizardComplete: false,
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
  const next = { ...loadSettings(), ...partial }
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
