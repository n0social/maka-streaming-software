import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { addonFolderName, isValidAddonId } from '../shared/addon-api'
import { canonicalAddonId, legacyAddonId } from '../shared/addon-ids'

export type AddonState = {
  /** addon id → enabled (default true when installed) */
  enabled: Record<string, boolean>
}

function statePath(): string {
  const dir = join(app.getPath('userData'), 'store')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'addon-state.json')
}

export function loadAddonState(): AddonState {
  const path = statePath()
  if (!existsSync(path)) return { enabled: {} }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<AddonState>
    const enabled: Record<string, boolean> = {}
    let migrated = false
    if (raw.enabled && typeof raw.enabled === 'object') {
      for (const [k, v] of Object.entries(raw.enabled)) {
        if (!isValidAddonId(k) || typeof v !== 'boolean') continue
        const id = canonicalAddonId(k)
        if (id !== k) migrated = true
        if (id === k || !(id in enabled)) enabled[id] = v
      }
    }
    const state = { enabled }
    if (migrated) saveAddonState(state)
    return state
  } catch {
    return { enabled: {} }
  }
}

export function saveAddonState(state: AddonState): void {
  writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export function isAddonEnabled(state: AddonState, id: string, builtin: boolean): boolean {
  if (builtin) return true
  const canon = canonicalAddonId(id)
  if (canon in state.enabled) return state.enabled[canon]
  const legacy = legacyAddonId(canon)
  if (legacy && legacy in state.enabled) return state.enabled[legacy]
  return true
}

export function setAddonEnabled(state: AddonState, id: string, enabled: boolean): AddonState {
  return {
    enabled: { ...state.enabled, [id]: enabled },
  }
}

export function addonsInstallDir(): string {
  const dir = join(app.getPath('userData'), 'addons')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function removeAddonDir(folderName: string): void {
  const target = join(addonsInstallDir(), folderName)
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true })
  }
}

export function resolveAddonDir(addonId: string): string {
  const root = addonsInstallDir()
  const canon = canonicalAddonId(addonId)
  const names = [addonFolderName(canon)]
  const legacy = legacyAddonId(canon)
  if (legacy) names.push(addonFolderName(legacy))
  for (const name of names) {
    const dir = join(root, name)
    if (existsSync(dir)) return dir
  }
  return join(root, names[0]!)
}
