/** Shared types for sandboxed addon iframe / webview runtime. */

export type AddonRuntimeInfo = {
  id: string
  name: string
  version: string
  apiVersion: number
}

export type AddonFetchInit = {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export type AddonFetchResult = {
  ok: boolean
  status: number
  body: string
}

export type AddonLiveEventPayload = {
  event: 'live.start' | 'live.end' | 'app.ready'
  profile?: '720p' | '1080p'
  platforms?: { twitch?: boolean; youtube?: boolean; custom?: boolean }
}

export const ADDON_PROTOCOL = 'maka-addon'

export function addonEntryUrl(addonId: string, entry: string): string {
  const file = entry.replace(/^\/+/, '')
  return `${ADDON_PROTOCOL}://${addonId}/${file}`
}
