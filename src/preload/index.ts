import { contextBridge, ipcRenderer } from 'electron'
import type { RelaySnapshot } from '../shared/relay-snapshot'

export type AppMode = 'studio' | 'browse'

export type CaptureSource = {
  id: string
  name: string
  type: 'screen' | 'window'
  thumbnailDataUrl: string
}

export type BrowserState = {
  url: string
  title: string
  canGoBack: boolean
  canGoForward: boolean
}

export type BrowseTabInfo = {
  id: string
  title: string
  url: string
  pinned: boolean
  active: boolean
}

export type AppSettings = {
  bitrateProfile: '720p' | '1080p'
  startupMode: 'studio' | 'browse'
  minimizeToTrayWhileLive: boolean
  openChatOnBrowse: boolean
  labMode: boolean
}

export type DiagEvent = {
  id: string
  at: string
  level: 'info' | 'warn' | 'error' | 'fatal'
  source: string
  message: string
  stack?: string
  detail?: Record<string, unknown>
}

export type VerifyReport = {
  ok: boolean
  checks: Array<{ name: string; ok: boolean; detail: string }>
  snapshot: RelaySnapshot
  diagnostics: DiagEvent[]
}

export type TabcastBridge = {
  getRelay: () => Promise<RelaySnapshot>
  startRelay: () => Promise<RelaySnapshot>
  stopRelay: () => Promise<RelaySnapshot>
  refreshRelay: () => Promise<RelaySnapshot>
  onRelayUpdate: (cb: (snapshot: RelaySnapshot) => void) => () => void
  getMode: () => Promise<AppMode>
  setMode: (mode: AppMode) => Promise<AppMode>
  onMode: (cb: (mode: AppMode) => void) => () => void
  navigate: (url: string) => Promise<string | null>
  back: () => Promise<void>
  forward: () => Promise<void>
  reload: () => Promise<void>
  getBrowserState: () => Promise<BrowserState | null>
  onNavigated: (cb: (state: BrowserState) => void) => () => void
  onTitle: (cb: (title: string) => void) => () => void
  listCaptureSources: () => Promise<CaptureSource[]>
  revealRelay: () => Promise<string>
  listDiagnostics: () => Promise<DiagEvent[]>
  clearDiagnostics: () => Promise<DiagEvent[]>
  exportDiagnostics: () => Promise<string>
  verifySystem: () => Promise<VerifyReport>
  onDiagnostic: (cb: (event: DiagEvent) => void) => () => void
  listTabs: () => Promise<BrowseTabInfo[]>
  newTab: (url?: string) => Promise<BrowseTabInfo | null>
  activateTab: (id: string) => Promise<BrowseTabInfo[]>
  closeTab: (id: string) => Promise<BrowseTabInfo[]>
  openPinned: (presetId: string) => Promise<BrowseTabInfo[]>
  onTabs: (cb: (tabs: BrowseTabInfo[]) => void) => () => void
  popoutChat: (url?: string) => Promise<void>
  getSettings: () => Promise<AppSettings>
  setSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<boolean>
  windowClose: () => Promise<void>
}

const api: TabcastBridge = {
  getRelay: () => ipcRenderer.invoke('relay:get'),
  startRelay: () => ipcRenderer.invoke('relay:start'),
  stopRelay: () => ipcRenderer.invoke('relay:stop'),
  refreshRelay: () => ipcRenderer.invoke('relay:refresh'),
  onRelayUpdate: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: RelaySnapshot) => cb(snapshot)
    ipcRenderer.on('relay:update', handler)
    return () => ipcRenderer.removeListener('relay:update', handler)
  },
  getMode: () => ipcRenderer.invoke('app:get-mode'),
  setMode: (mode) => ipcRenderer.invoke('app:set-mode', mode),
  onMode: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, mode: AppMode) => cb(mode)
    ipcRenderer.on('app:mode', handler)
    return () => ipcRenderer.removeListener('app:mode', handler)
  },
  navigate: (url) => ipcRenderer.invoke('browser:navigate', url),
  back: () => ipcRenderer.invoke('browser:back'),
  forward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  getBrowserState: () => ipcRenderer.invoke('browser:state'),
  onNavigated: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, state: BrowserState) => cb(state)
    ipcRenderer.on('browser:navigated', handler)
    return () => ipcRenderer.removeListener('browser:navigated', handler)
  },
  onTitle: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, title: string) => cb(title)
    ipcRenderer.on('browser:title', handler)
    return () => ipcRenderer.removeListener('browser:title', handler)
  },
  listCaptureSources: () => ipcRenderer.invoke('capture:list-sources'),
  revealRelay: () => ipcRenderer.invoke('relay:reveal'),
  listDiagnostics: () => ipcRenderer.invoke('diagnostics:list'),
  clearDiagnostics: () => ipcRenderer.invoke('diagnostics:clear'),
  exportDiagnostics: () => ipcRenderer.invoke('diagnostics:export'),
  verifySystem: () => ipcRenderer.invoke('diagnostics:verify'),
  onDiagnostic: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, event: DiagEvent) => cb(event)
    ipcRenderer.on('diagnostics:event', handler)
    return () => ipcRenderer.removeListener('diagnostics:event', handler)
  },
  listTabs: () => ipcRenderer.invoke('browser:tabs'),
  newTab: (url) => ipcRenderer.invoke('browser:new-tab', url),
  activateTab: (id) => ipcRenderer.invoke('browser:activate-tab', id),
  closeTab: (id) => ipcRenderer.invoke('browser:close-tab', id),
  openPinned: (presetId) => ipcRenderer.invoke('browser:open-pinned', presetId),
  onTabs: (cb) => {
    const handler = (_event: Electron.IpcRendererEvent, tabs: BrowseTabInfo[]) => cb(tabs)
    ipcRenderer.on('browser:tabs', handler)
    return () => ipcRenderer.removeListener('browser:tabs', handler)
  },
  popoutChat: (url) => ipcRenderer.invoke('browser:popout-chat', url),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose: () => ipcRenderer.invoke('window:close'),
}

contextBridge.exposeInMainWorld('tabcast', api)
