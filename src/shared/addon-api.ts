import type { AddonManifest, DeclarativeAddonAction } from './addon-types'

/** Supported addon API major version (manifest.apiVersion). */
export const ADDON_API_VERSION = 1

const ADDON_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$/

/** Permissions an addon may request in tabcast-addon.json. */
export const ADDON_PERMISSIONS = [
  'ui.toast',
  'ui.external',
  'scene.overlay',
  'scene.layout',
  'browse.tabs.read',
  'relay.config.read',
  'relay.config.write',
  'network.fetch',
  'live.events',
  'device.phone-pair',
] as const

export type AddonPermission = (typeof ADDON_PERMISSIONS)[number]

const PERMISSION_SET = new Set<string>(ADDON_PERMISSIONS)

export function isValidAddonId(id: unknown): id is string {
  return typeof id === 'string' && ADDON_ID_RE.test(id)
}

export function isValidCatalogId(id: unknown): id is string {
  return isValidAddonId(id)
}

export function normalizePermissions(raw: unknown): AddonPermission[] {
  if (!Array.isArray(raw)) return []
  const out: AddonPermission[] = []
  for (const p of raw) {
    if (typeof p === 'string' && PERMISSION_SET.has(p)) {
      out.push(p as AddonPermission)
    }
  }
  return out
}

export function validateManifest(
  raw: unknown,
): { ok: true; manifest: AddonManifest } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Manifest must be a JSON object' }
  }
  const m = raw as Record<string, unknown>
  if (!isValidAddonId(m.id)) {
    return { ok: false, error: 'Invalid addon id (use reverse-DNS, e.g. com.author.name)' }
  }
  if (typeof m.name !== 'string' || !m.name.trim()) {
    return { ok: false, error: 'Manifest name is required' }
  }
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+/.test(m.version)) {
    return { ok: false, error: 'Manifest version must be semver (e.g. 1.0.0)' }
  }
  const apiVersion = typeof m.apiVersion === 'number' ? m.apiVersion : 1
  if (apiVersion !== ADDON_API_VERSION) {
    return { ok: false, error: `Unsupported apiVersion ${apiVersion} (need ${ADDON_API_VERSION})` }
  }

  const manifest: AddonManifest = {
    id: m.id,
    name: m.name.trim().slice(0, 80),
    version: m.version,
    apiVersion,
    permissions: normalizePermissions(m.permissions),
    hooks: Array.isArray(m.hooks) ? m.hooks.filter((h) => typeof h === 'string').slice(0, 20) : [],
    description: typeof m.description === 'string' ? m.description.slice(0, 400) : undefined,
    author: typeof m.author === 'string' ? m.author.slice(0, 80) : undefined,
    category: isCatalogCategory(m.category) ? m.category : undefined,
    builtin: Boolean(m.builtin),
    contributes: parseContributes(m.contributes),
  }

  if (typeof m.entry === 'string' && m.entry.trim()) {
    manifest.entry = m.entry.trim().slice(0, 120)
  }

  return { ok: true, manifest }
}

function isCatalogCategory(v: unknown): v is NonNullable<AddonManifest['category']> {
  return v === 'production' || v === 'platform' || v === 'utility' || v === 'builtin'
}

function parseContributes(raw: unknown): AddonManifest['contributes'] {
  if (!raw || typeof raw !== 'object') return undefined
  const c = raw as Record<string, unknown>
  const panelsRaw = c.sidebarPanels
  if (!Array.isArray(panelsRaw)) return undefined

  const sidebarPanels = panelsRaw
    .map((panel) => {
      if (!panel || typeof panel !== 'object') return null
      const p = panel as Record<string, unknown>
      if (typeof p.id !== 'string' || typeof p.title !== 'string') return null
      const actionsRaw = p.actions
      if (!Array.isArray(actionsRaw)) return null
      const actions: DeclarativeAddonAction[] = []
      for (const a of actionsRaw) {
        const parsed = parseDeclarativeAction(a)
        if (parsed) actions.push(parsed)
      }
      return {
        id: p.id.slice(0, 64),
        title: p.title.slice(0, 80),
        description: typeof p.description === 'string' ? p.description.slice(0, 200) : undefined,
        actions,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.actions.length > 0)

  if (!sidebarPanels.length) return undefined
  return { sidebarPanels }
}

function parseDeclarativeAction(raw: unknown): DeclarativeAddonAction | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  if (typeof a.id !== 'string' || typeof a.label !== 'string') return null
  const type = a.type
  if (type === 'message') {
    return {
      id: a.id.slice(0, 64),
      label: a.label.slice(0, 80),
      description: typeof a.description === 'string' ? a.description.slice(0, 200) : undefined,
      type: 'message',
      message: typeof a.message === 'string' ? a.message.slice(0, 500) : 'OK',
    }
  }
  if (type === 'open-url') {
    const url = typeof a.url === 'string' ? a.url.trim() : ''
    if (!url.startsWith('https://')) return null
    return {
      id: a.id.slice(0, 64),
      label: a.label.slice(0, 80),
      description: typeof a.description === 'string' ? a.description.slice(0, 200) : undefined,
      type: 'open-url',
      url: url.slice(0, 500),
    }
  }
  if (type === 'scene-template') {
    const templateId = typeof a.templateId === 'string' ? a.templateId : ''
    if (!templateId) return null
    return {
      id: a.id.slice(0, 64),
      label: a.label.slice(0, 80),
      description: typeof a.description === 'string' ? a.description.slice(0, 200) : undefined,
      type: 'scene-template',
      templateId: templateId.slice(0, 64),
    }
  }
  return null
}

export function addonHasPermission(manifest: AddonManifest, permission: AddonPermission): boolean {
  return (manifest.permissions ?? []).includes(permission)
}

export function addonFolderName(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, '-')
}
