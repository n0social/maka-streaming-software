import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { shell } from 'electron'
import {
  addonFolderName,
  addonHasPermission,
  isValidCatalogId,
  validateManifest,
} from '../shared/addon-api'
import type {
  AddonActionResult,
  AddonInstallResult,
  AddonLiveEventResult,
  AddonManifest,
  AddonPanel,
  AddonSettingsSnapshot,
  CatalogEntry,
  DeclarativeAddonAction,
  LiveEventContext,
  LiveEventName,
  MarketplaceItem,
} from '../shared/addon-types'
import { SCENE_TEMPLATES } from '../shared/scene-templates'
import type { StreamProfile } from '../shared/tabcast'
import { loadAddonSettings, saveAddonSettings } from './addon-settings'
import {
  getBundledCatalog,
  getCachedCatalog,
  refreshMarketplaceFeed,
} from './marketplace-feed'
import {
  addonsInstallDir,
  isAddonEnabled,
  loadAddonState,
  removeAddonDir,
  saveAddonState,
  setAddonEnabled,
  type AddonState,
} from './addon-state'
import { recordDiagnostic } from './diagnostics'
import type { AddonRuntime } from './addon-runtime'

type ActionContext = {
  profile: StreamProfile
  hasWebcam: boolean
}

export class AddonHost {
  private manifests = new Map<string, AddonManifest>()
  private state: AddonState = loadAddonState()
  private catalog: CatalogEntry[] = getBundledCatalog()

  constructor(private runtime: AddonRuntime | null = null) {}

  boot(): void {
    this.catalog = getCachedCatalog()
    this.reload()
    recordDiagnostic('info', 'addons.boot', `Loaded ${this.manifests.size} addon(s)`)
    void refreshMarketplaceFeed().then((entries) => {
      this.catalog = entries
      recordDiagnostic('info', 'marketplace.feed', `Catalog ready (${entries.length} entries)`)
    })
  }

  reload(): void {
    this.manifests.clear()
    this.state = loadAddonState()
    this.registerBuiltin({
      id: 'tabcast.scene-templates',
      name: 'Scene templates',
      version: '1.0.0',
      apiVersion: 1,
      author: 'Tabcast',
      category: 'builtin',
      description: 'One-click layouts for the relay encoder.',
      permissions: ['scene.layout'],
      hooks: ['studio.sidebar.panel'],
      builtin: true,
    })
    this.loadUserAddons()
  }

  list(): AddonManifest[] {
    return [...this.manifests.values()]
  }

  getManifest(addonId: string): AddonManifest | undefined {
    return this.manifests.get(addonId)
  }

  isAddonActive(addonId: string): boolean {
    const manifest = this.manifests.get(addonId)
    if (!manifest) return false
    return isAddonEnabled(this.state, addonId, Boolean(manifest.builtin))
  }

  listMarketplace(): MarketplaceItem[] {
    return this.catalog.map((entry) => this.toMarketplaceItem(entry))
  }

  refreshMarketplace(): Promise<MarketplaceItem[]> {
    return refreshMarketplaceFeed(true).then((entries) => {
      this.catalog = entries
      return this.listMarketplace()
    })
  }

  getAddonSettings(addonId: string): AddonSettingsSnapshot {
    const manifest = this.manifests.get(addonId)
    if (!manifest) return {}
    const settings = loadAddonSettings(addonId)
    return {
      discordWebhookUrl: settings.discordWebhookUrl ? '••••••••' : undefined,
      customRtmpUrl: settings.customRtmpUrl,
      customRtmpKeyConfigured: Boolean(settings.customRtmpKey),
    }
  }

  setAddonSettings(addonId: string, partial: unknown): AddonInstallResult {
    const manifest = this.manifests.get(addonId)
    if (!manifest) {
      return { ok: false, message: 'Addon not installed' }
    }
    saveAddonSettings(addonId, partial)
    return { ok: true, message: 'Addon settings saved' }
  }

  async dispatchLiveEvent(
    event: LiveEventName,
    ctx: LiveEventContext,
  ): Promise<AddonLiveEventResult[]> {
    const hook = event === 'live.start' ? 'live.start' : 'live.end'
    const results: AddonLiveEventResult[] = []

    for (const manifest of this.manifests.values()) {
      if (!isAddonEnabled(this.state, manifest.id, Boolean(manifest.builtin))) continue
      if (!(manifest.hooks ?? []).includes(hook)) continue
      if (!addonHasPermission(manifest, 'live.events')) {
        results.push({
          addonId: manifest.id,
          ok: false,
          message: 'Missing permission: live.events',
        })
        continue
      }

      const result = await this.runLiveHook(manifest, event, ctx)
      results.push(result)
      recordDiagnostic(
        result.ok ? 'info' : 'warn',
        'addons.live',
        `${manifest.id} ${event}: ${result.message ?? (result.ok ? 'ok' : 'failed')}`,
      )
    }

    return results
  }

  listPanels(): AddonPanel[] {
    const panels: AddonPanel[] = []

    if (
      this.manifests.has('tabcast.scene-templates') &&
      isAddonEnabled(this.state, 'tabcast.scene-templates', true)
    ) {
      panels.push({
        addonId: 'tabcast.scene-templates',
        title: 'Scene templates',
        description: 'One-click layouts for the relay encoder.',
        actions: SCENE_TEMPLATES.map((t) => ({
          id: t.id,
          label: t.name,
          description: t.description,
        })),
      })
    }

    for (const manifest of this.manifests.values()) {
      if (manifest.builtin) continue
      if (!isAddonEnabled(this.state, manifest.id, false)) continue

      const runtimeUrl = this.runtime?.resolveEntryUrl(manifest) ?? undefined
      const contributed = manifest.contributes?.sidebarPanels ?? []

      if (runtimeUrl) {
        const panel = contributed[0]
        panels.push({
          addonId: manifest.id,
          title: panel?.title ?? manifest.name,
          description: panel?.description ?? manifest.description,
          runtimeUrl,
          actions: (panel?.actions ?? []).map((a) => ({
            id: a.id,
            label: a.label,
            description: a.description,
          })),
        })
        continue
      }

      for (const panel of contributed) {
        panels.push({
          addonId: manifest.id,
          title: panel.title,
          description: panel.description ?? manifest.description,
          actions: panel.actions.map((a) => ({
            id: a.id,
            label: a.label,
            description: a.description,
          })),
        })
      }

      if (!contributed.length) {
        panels.push({
          addonId: manifest.id,
          title: manifest.name,
          description: manifest.description ?? `v${manifest.version} · installed addon`,
          actions: [],
        })
      }
    }

    return panels
  }

  runAction(addonId: string, actionId: string, ctx: ActionContext): AddonActionResult {
    if (addonId === 'tabcast.scene-templates') {
      return this.runSceneTemplate(actionId, ctx)
    }

    const manifest = this.manifests.get(addonId)
    if (!manifest) {
      return { ok: false, message: 'Addon not found' }
    }
    if (!isAddonEnabled(this.state, addonId, Boolean(manifest.builtin))) {
      return { ok: false, message: 'Addon is disabled' }
    }

    const action = this.findDeclarativeAction(manifest, actionId)
    if (!action) {
      return { ok: false, message: 'Unknown addon action' }
    }

    return this.runDeclarativeAction(manifest, action, ctx)
  }

  install(catalogId: string): AddonInstallResult {
    if (!isValidCatalogId(catalogId)) {
      return { ok: false, message: 'Invalid catalog id' }
    }
    const entry = this.catalog.find((e) => e.catalogId === catalogId)
    if (!entry) {
      return { ok: false, message: 'Catalog entry not found' }
    }
    if (entry.manifest.builtin) {
      return { ok: false, message: 'Built-in addons are already included' }
    }

    const validated = validateManifest(entry.manifest)
    if (!validated.ok) {
      return { ok: false, message: validated.error }
    }

    const folder = addonFolderName(validated.manifest.id)
    const dir = join(addonsInstallDir(), folder)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'tabcast-addon.json'),
      `${JSON.stringify(validated.manifest, null, 2)}\n`,
      'utf8',
    )

    for (const [rel, content] of Object.entries(entry.files ?? {})) {
      if (rel.includes('..')) continue
      const filePath = join(dir, rel)
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, content, 'utf8')
    }

    this.state = setAddonEnabled(this.state, validated.manifest.id, true)
    saveAddonState(this.state)
    this.reload()
    recordDiagnostic('info', 'addons.install', `Installed ${validated.manifest.id}`)
    return { ok: true, message: `Installed ${validated.manifest.name}` }
  }

  uninstall(addonId: string): AddonInstallResult {
    if (!isValidCatalogId(addonId)) {
      return { ok: false, message: 'Invalid addon id' }
    }
    const manifest = this.manifests.get(addonId)
    if (!manifest) {
      return { ok: false, message: 'Addon not installed' }
    }
    if (manifest.builtin) {
      return { ok: false, message: 'Cannot uninstall built-in addons' }
    }

    removeAddonDir(addonFolderName(addonId))
    const nextEnabled = { ...this.state.enabled }
    delete nextEnabled[addonId]
    this.state = { enabled: nextEnabled }
    saveAddonState(this.state)
    this.reload()
    recordDiagnostic('info', 'addons.uninstall', `Removed ${addonId}`)
    return { ok: true, message: 'Addon removed' }
  }

  setEnabled(addonId: string, enabled: boolean): AddonInstallResult {
    if (!isValidCatalogId(addonId)) {
      return { ok: false, message: 'Invalid addon id' }
    }
    const manifest = this.manifests.get(addonId)
    if (!manifest) {
      return { ok: false, message: 'Addon not installed' }
    }
    if (manifest.builtin) {
      return { ok: false, message: 'Built-in addons are always enabled' }
    }
    this.state = setAddonEnabled(this.state, addonId, enabled)
    saveAddonState(this.state)
    return { ok: true, message: enabled ? 'Addon enabled' : 'Addon disabled' }
  }

  private toMarketplaceItem(entry: CatalogEntry): MarketplaceItem {
    const m = entry.manifest
    const installed = m.builtin || this.manifests.has(m.id)
    return {
      catalogId: entry.catalogId,
      id: m.id,
      name: m.name,
      version: m.version,
      author: m.author,
      description: m.description,
      category: m.category,
      permissions: m.permissions ?? [],
      featured: Boolean(entry.featured),
      builtin: Boolean(m.builtin),
      installed,
      enabled: installed ? isAddonEnabled(this.state, m.id, Boolean(m.builtin)) : false,
    }
  }

  private runSceneTemplate(actionId: string, ctx: ActionContext): AddonActionResult {
    const template = SCENE_TEMPLATES.find((t) => t.id === actionId)
    if (!template) {
      return { ok: false, message: 'Unknown template' }
    }
    return {
      ok: true,
      message: `Applied “${template.name}”`,
      sceneLayout: template.build({
        profile: ctx.profile,
        hasWebcam: ctx.hasWebcam,
      }),
    }
  }

  private findDeclarativeAction(
    manifest: AddonManifest,
    actionId: string,
  ): DeclarativeAddonAction | null {
    for (const panel of manifest.contributes?.sidebarPanels ?? []) {
      const action = panel.actions.find((a) => a.id === actionId)
      if (action) return action
    }
    return null
  }

  private runDeclarativeAction(
    manifest: AddonManifest,
    action: DeclarativeAddonAction,
    ctx: ActionContext,
  ): AddonActionResult {
    if (action.type === 'message') {
      if (!addonHasPermission(manifest, 'ui.toast')) {
        return { ok: false, message: 'Missing permission: ui.toast' }
      }
      return { ok: true, message: action.message }
    }

    if (action.type === 'open-url') {
      if (!addonHasPermission(manifest, 'ui.external')) {
        return { ok: false, message: 'Missing permission: ui.external' }
      }
      const url = action.url.trim()
      if (!url.startsWith('https://')) {
        return { ok: false, message: 'Only HTTPS URLs are allowed' }
      }
      void shell.openExternal(url)
      return { ok: true, message: 'Opened link in browser', openUrl: url }
    }

    if (action.type === 'scene-template') {
      if (!addonHasPermission(manifest, 'scene.layout')) {
        return { ok: false, message: 'Missing permission: scene.layout' }
      }
      return this.runSceneTemplate(action.templateId, ctx)
    }

    return { ok: false, message: 'Unsupported action type' }
  }

  private async runLiveHook(
    manifest: AddonManifest,
    event: LiveEventName,
    ctx: LiveEventContext,
  ): Promise<AddonLiveEventResult> {
    if (!addonHasPermission(manifest, 'network.fetch')) {
      return {
        addonId: manifest.id,
        ok: false,
        message: 'Missing permission: network.fetch',
      }
    }

    const settings = loadAddonSettings(manifest.id)
    const webhook = settings.discordWebhookUrl
    if (!webhook) {
      return {
        addonId: manifest.id,
        ok: true,
        message: 'No webhook configured — skipped',
      }
    }

    const platforms = [
      ctx.platforms?.twitch ? 'Twitch' : null,
      ctx.platforms?.youtube ? 'YouTube' : null,
    ]
      .filter(Boolean)
      .join(' + ')

    const content =
      event === 'live.end'
        ? 'Stream ended on Tabcast Browser.'
        : `Now live on Tabcast Browser${platforms ? ` (${platforms})` : ''} · ${ctx.profile}`

    const body =
      event === 'live.start'
        ? {
            embeds: [
              {
                title: '🔴 Now live',
                description: content,
                color: 0xc9a227,
              },
            ],
          }
        : { content }

    return await this.postDiscordWebhook(manifest.id, webhook, body)
  }

  private async postDiscordWebhook(
    addonId: string,
    webhook: string,
    body: Record<string, unknown>,
  ): Promise<AddonLiveEventResult> {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) {
        return {
          addonId,
          ok: false,
          message: `Discord webhook failed (HTTP ${res.status})`,
        }
      }
      return { addonId, ok: true, message: 'Discord notification sent' }
    } catch (err) {
      return {
        addonId,
        ok: false,
        message: err instanceof Error ? err.message : 'Discord webhook failed',
      }
    }
  }

  private registerBuiltin(manifest: AddonManifest): void {
    this.manifests.set(manifest.id, manifest)
  }

  private loadUserAddons(): void {
    const dir = addonsInstallDir()
    let entries: string[] = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    } catch {
      return
    }

    for (const folder of entries) {
      const manifestPath = join(dir, folder, 'tabcast-addon.json')
      if (!existsSync(manifestPath)) continue
      try {
        const raw = JSON.parse(readFileSync(manifestPath, 'utf8'))
        const validated = validateManifest(raw)
        if (!validated.ok) {
          recordDiagnostic('warn', 'addons.load', `${folder}: ${validated.error}`)
          continue
        }
        if (validated.manifest.builtin) continue
        this.manifests.set(validated.manifest.id, validated.manifest)
      } catch (err) {
        recordDiagnostic('warn', 'addons.load', `Invalid manifest: ${folder}`, err)
      }
    }
  }
}
