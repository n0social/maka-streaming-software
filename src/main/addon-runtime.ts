import { existsSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { protocol, shell, type WebContents } from 'electron'
import { addonHasPermission } from '../shared/addon-api'
import {
  ADDON_PROTOCOL,
  addonEntryUrl,
  type AddonFetchInit,
  type AddonFetchResult,
  type AddonLiveEventPayload,
  type AddonRuntimeInfo,
} from '../shared/addon-runtime'
import type { AddonManifest } from '../shared/addon-types'
import type { PhonePairSnapshot } from '../shared/phone-pair'
import { canonicalAddonId } from '../shared/addon-ids'
import { loadAddonSettings, saveAddonSettings } from './addon-settings'
import { resolveAddonDir } from './addon-state'
import { recordDiagnostic } from './diagnostics'
import type { AddonHost } from './addon-host'

const MAX_FETCH_BODY = 65_536
const FETCH_TIMEOUT_MS = 10_000

export class AddonRuntime {
  private liveSubscribers = new Set<WebContents>()

  registerProtocol(host: AddonHost): void {
    protocol.registerFileProtocol(ADDON_PROTOCOL, (request, callback) => {
      try {
        const url = new URL(request.url)
        const addonId = canonicalAddonId(decodeURIComponent(url.hostname))
        const manifest = host.getManifest(addonId)
        if (!manifest || manifest.builtin) {
          callback({ error: -2 })
          return
        }

        let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
        if (rel.includes('..') || rel.includes('\\')) {
          callback({ error: -2 })
          return
        }

        const base = normalize(resolveAddonDir(addonId))
        const filePath = normalize(join(base, rel))
        if (!filePath.startsWith(base) || !existsSync(filePath)) {
          callback({ error: -2 })
          return
        }

        callback({ path: filePath })
      } catch (err) {
        recordDiagnostic('warn', 'addon.protocol', 'Protocol handler failed', err)
        callback({ error: -2 })
      }
    })
    recordDiagnostic('info', 'addon.protocol', `Registered ${ADDON_PROTOCOL}://`)
  }

  resolveEntryUrl(manifest: AddonManifest): string | null {
    if (!manifest.entry || manifest.builtin) return null
    const entry = manifest.entry.trim()
    if (!entry) return null

    const base = resolveAddonDir(manifest.id)
    let file = entry
    if (entry.endsWith('.js') && !existsSync(join(base, entry))) {
      file = 'index.html'
    }
    if (!existsSync(join(base, file))) {
      if (existsSync(join(base, 'index.html'))) {
        file = 'index.html'
      } else if (existsSync(join(base, entry))) {
        file = entry
      } else {
        return null
      }
    }

    return addonEntryUrl(manifest.id, file)
  }

  addonIdFromSender(sender: WebContents, host: AddonHost): string | null {
    const url = sender.getURL()
    if (!url.startsWith(`${ADDON_PROTOCOL}://`)) return null
    try {
      const id = decodeURIComponent(new URL(url).hostname)
      return host.getManifest(id) ? id : null
    } catch {
      return null
    }
  }

  trackWebContents(sender: WebContents): void {
    this.liveSubscribers.add(sender)
    sender.once('destroyed', () => {
      this.liveSubscribers.delete(sender)
    })
  }

  broadcastPhonePair(host: AddonHost, snapshot: PhonePairSnapshot): void {
    for (const wc of [...this.liveSubscribers]) {
      if (wc.isDestroyed()) {
        this.liveSubscribers.delete(wc)
        continue
      }
      const addonId = this.addonIdFromSender(wc, host)
      if (!addonId) continue
      const manifest = host.getManifest(addonId)
      if (!manifest || !host.isAddonActive(addonId)) continue
      if (!addonHasPermission(manifest, 'device.phone-pair')) continue
      wc.send('addon-runtime:phone-pair-update', snapshot)
    }
  }

  broadcastLiveEvent(host: AddonHost, payload: AddonLiveEventPayload): void {
    const hook =
      payload.event === 'live.start'
        ? 'live.start'
        : payload.event === 'live.end'
          ? 'live.end'
          : 'app.ready'

    for (const wc of [...this.liveSubscribers]) {
      if (wc.isDestroyed()) {
        this.liveSubscribers.delete(wc)
        continue
      }
      const addonId = this.addonIdFromSender(wc, host)
      if (!addonId) continue
      const manifest = host.getManifest(addonId)
      if (!manifest) continue
      if (!(manifest.hooks ?? []).includes(hook)) continue
      if (hook !== 'app.ready' && !addonHasPermission(manifest, 'live.events')) continue
      wc.send('addon-runtime:live-event', payload)
    }
  }

  getInfo(manifest: AddonManifest): AddonRuntimeInfo {
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      apiVersion: manifest.apiVersion,
    }
  }

  async fetch(
    manifest: AddonManifest,
    url: string,
    init?: AddonFetchInit,
  ): Promise<AddonFetchResult> {
    if (!addonHasPermission(manifest, 'network.fetch')) {
      throw new Error('Missing permission: network.fetch')
    }
    const target = url.trim()
    if (!target.startsWith('https://')) {
      throw new Error('Only HTTPS URLs are allowed')
    }

    const method = (init?.method ?? 'GET').toUpperCase().slice(0, 16)
    const headers: Record<string, string> = {}
    if (init?.headers && typeof init.headers === 'object') {
      for (const [k, v] of Object.entries(init.headers)) {
        if (typeof v === 'string') headers[k.slice(0, 64)] = v.slice(0, 512)
      }
    }

    const res = await fetch(target, {
      method,
      headers,
      body: init?.body?.slice(0, MAX_FETCH_BODY),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    const body = (await res.text()).slice(0, MAX_FETCH_BODY)
    return { ok: res.ok, status: res.status, body }
  }

  toast(manifest: AddonManifest, message: string): void {
    if (!addonHasPermission(manifest, 'ui.toast')) {
      throw new Error('Missing permission: ui.toast')
    }
    recordDiagnostic('info', `addon.${manifest.id}`, message.slice(0, 500))
  }

  openExternal(manifest: AddonManifest, url: string): void {
    if (!addonHasPermission(manifest, 'ui.external')) {
      throw new Error('Missing permission: ui.external')
    }
    const target = url.trim()
    if (!target.startsWith('https://')) {
      throw new Error('Only HTTPS URLs are allowed')
    }
    void shell.openExternal(target)
  }

  getSettings(addonId: string): Record<string, unknown> {
    return { ...loadAddonSettings(addonId) }
  }

  setSettings(addonId: string, partial: unknown): void {
    saveAddonSettings(addonId, partial)
  }
}
