import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { validateManifest } from '../shared/addon-api'
import { canonicalAddonId } from '../shared/addon-ids'
import type { CatalogEntry } from '../shared/addon-types'
import { MARKETPLACE_CATALOG } from '../shared/marketplace-catalog'
import { recordDiagnostic } from './diagnostics'

const FEED_URLS = [
  'https://tabcast.live.skydav.work/marketplace.json',
  'https://tabcast.live/marketplace.json',
]
const CACHE_TTL_MS = 60 * 60 * 1000

type CacheFile = {
  fetchedAt: string
  entries: CatalogEntry[]
}

function cachePath(): string {
  const dir = join(app.getPath('userData'), 'store')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'marketplace-cache.json')
}

function readCache(): CacheFile | null {
  const path = cachePath()
  if (!existsSync(path)) return null
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as CacheFile
    if (!Array.isArray(raw.entries)) return null
    return raw
  } catch {
    return null
  }
}

function writeCache(entries: CatalogEntry[]): void {
  const payload: CacheFile = {
    fetchedAt: new Date().toISOString(),
    entries,
  }
  writeFileSync(cachePath(), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function parseRemoteEntries(raw: unknown): CatalogEntry[] {
  if (!Array.isArray(raw)) return []
  const out: CatalogEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    if (typeof entry.catalogId !== 'string' || !entry.manifest) continue
    const validated = validateManifest(entry.manifest)
    if (!validated.ok) {
      recordDiagnostic('warn', 'marketplace.feed', `Skipped ${entry.catalogId}: ${validated.error}`)
      continue
    }
    const filesRaw = entry.files
    let files: Record<string, string> | undefined
    if (filesRaw && typeof filesRaw === 'object') {
      files = {}
      for (const [k, v] of Object.entries(filesRaw as Record<string, unknown>)) {
        if (typeof k === 'string' && !k.includes('..') && typeof v === 'string') {
          files[k] = v
        }
      }
      if (!Object.keys(files).length) files = undefined
    }

    const manifest = {
      ...validated.manifest,
      id: canonicalAddonId(validated.manifest.id),
    }
    out.push({
      catalogId: canonicalAddonId(entry.catalogId.slice(0, 128)),
      featured: Boolean(entry.featured),
      manifest,
      files,
    })
  }
  return out
}

function mergeCatalog(bundled: CatalogEntry[], remote: CatalogEntry[]): CatalogEntry[] {
  const byId = new Map<string, CatalogEntry>()
  for (const entry of bundled) {
    byId.set(entry.catalogId, entry)
  }
  for (const entry of remote) {
    byId.set(entry.catalogId, entry)
  }
  return [...byId.values()]
}

export function getBundledCatalog(): CatalogEntry[] {
  return MARKETPLACE_CATALOG
}

export function getCachedCatalog(): CatalogEntry[] {
  const cache = readCache()
  if (!cache) return getBundledCatalog()
  const age = Date.now() - Date.parse(cache.fetchedAt)
  if (Number.isNaN(age) || age > CACHE_TTL_MS) {
    return mergeCatalog(getBundledCatalog(), cache.entries)
  }
  return mergeCatalog(getBundledCatalog(), cache.entries)
}

export async function refreshMarketplaceFeed(force = false): Promise<CatalogEntry[]> {
  const cache = readCache()
  if (!force && cache) {
    const age = Date.now() - Date.parse(cache.fetchedAt)
    if (!Number.isNaN(age) && age < CACHE_TTL_MS) {
      return mergeCatalog(getBundledCatalog(), cache.entries)
    }
  }

  for (const feedUrl of FEED_URLS) {
    try {
      const res = await fetch(feedUrl, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const contentType = res.headers.get('content-type') ?? ''
      const text = await res.text()
      if (!contentType.includes('json') && text.trimStart().startsWith('<')) {
        throw new Error('Feed returned HTML instead of JSON')
      }
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        throw new Error('Feed body is not valid JSON')
      }
      const remote = parseRemoteEntries(raw)
      if (!remote.length) {
        throw new Error('Feed contained no valid catalog entries')
      }
      writeCache(remote)
      recordDiagnostic('info', 'marketplace.feed', `Fetched ${remote.length} entries from ${feedUrl}`)
      return mergeCatalog(getBundledCatalog(), remote)
    } catch (err) {
      recordDiagnostic('warn', 'marketplace.feed', `${feedUrl} unavailable`, err)
    }
  }

  recordDiagnostic('warn', 'marketplace.feed', 'Remote feed unavailable — using bundled catalog')
  if (cache?.entries.length) {
    return mergeCatalog(getBundledCatalog(), cache.entries)
  }
  return getBundledCatalog()
}
