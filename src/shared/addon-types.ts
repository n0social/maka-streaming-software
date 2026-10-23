import type { SceneLayout } from './tabcast'

export type DeclarativeAddonAction =
  | {
      id: string
      label: string
      description?: string
      type: 'message'
      message: string
    }
  | {
      id: string
      label: string
      description?: string
      type: 'open-url'
      url: string
    }
  | {
      id: string
      label: string
      description?: string
      type: 'scene-template'
      templateId: string
    }

export type AddonContributes = {
  sidebarPanels?: Array<{
    id: string
    title: string
    description?: string
    actions: DeclarativeAddonAction[]
  }>
}

export type AddonManifest = {
  id: string
  name: string
  version: string
  apiVersion: number
  entry?: string
  permissions?: string[]
  hooks?: string[]
  description?: string
  author?: string
  category?: 'production' | 'platform' | 'utility' | 'builtin'
  builtin?: boolean
  contributes?: AddonContributes
}

export type AddonPanelAction = {
  id: string
  label: string
  description?: string
}

export type AddonPanel = {
  addonId: string
  title: string
  description?: string
  /** Sandboxed webview URL when manifest declares entry. */
  runtimeUrl?: string
  actions: AddonPanelAction[]
}

export type AddonActionResult = {
  ok: boolean
  message?: string
  sceneLayout?: SceneLayout
  openUrl?: string
}

export type CatalogEntry = {
  catalogId: string
  featured?: boolean
  manifest: AddonManifest
  files?: Record<string, string>
}

export type MarketplaceItem = {
  catalogId: string
  id: string
  name: string
  version: string
  author?: string
  description?: string
  category?: string
  permissions: string[]
  featured: boolean
  builtin: boolean
  installed: boolean
  enabled: boolean
}

export type AddonInstallResult = {
  ok: boolean
  message?: string
}

export type LiveEventName = 'live.start' | 'live.end'

export type LiveEventContext = {
  profile: '720p' | '1080p'
  platforms?: { twitch?: boolean; youtube?: boolean }
}

export type AddonLiveEventResult = {
  addonId: string
  ok: boolean
  message?: string
}

export type AddonSettingsSnapshot = {
  discordWebhookUrl?: string
  customRtmpUrl?: string
  customRtmpKeyConfigured?: boolean
  turnUrl?: string
  turnUsername?: string
  turnCredentialConfigured?: boolean
}
