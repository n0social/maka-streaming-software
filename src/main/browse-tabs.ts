import { BrowserWindow, WebContents, WebContentsView } from 'electron'
import { randomUUID } from 'node:crypto'
import { isAllowedBrowseUrl, normalizeBrowseUrl } from '../shared/browse-url'
import type { BrowseCaptureInfo } from '../shared/capture'
import { loadSession, saveSession, type SavedBrowseTab } from './settings-store'
import { recordDiagnostic } from './diagnostics'

export type BrowseTabInfo = {
  id: string
  title: string
  url: string
  pinned: boolean
  active: boolean
}

export const PINNED_PRESETS: Array<{ id: string; title: string; url: string }> = [
  { id: 'pin-twitch', title: 'Twitch', url: 'https://www.twitch.tv/directory' },
  { id: 'pin-yt-studio', title: 'YT Studio', url: 'https://studio.youtube.com/' },
  { id: 'pin-yt-chat', title: 'YT Live Chat', url: 'https://studio.youtube.com/livestreaming/chat' },
  { id: 'pin-chat', title: 'Twitch Chat', url: 'https://www.twitch.tv/popout/directory/chat?popout=' },
]

type TabRecord = {
  id: string
  pinned: boolean
  title: string
  view: WebContentsView
}

export { normalizeBrowseUrl } from '../shared/browse-url'

export class BrowseTabsManager {
  private win: BrowserWindow | null = null
  private tabs = new Map<string, TabRecord>()
  private order: string[] = []
  private activeId: string | null = null
  private bounds = { x: 0, y: 0, width: 0, height: 0 }
  private visible = false
  private capturePinned = false

  attach(win: BrowserWindow): void {
    this.win = win
  }

  detach(): void {
    for (const id of [...this.order]) {
      this.destroyTab(id, false)
    }
    this.win = null
    this.activeId = null
  }

  list(): BrowseTabInfo[] {
    return this.order.flatMap((id) => {
      const tab = this.tabs.get(id)
      if (!tab) return []
      return [
        {
          id,
          title: tab.title || 'New Tab',
          url: tab.view.webContents.getURL() || 'about:blank',
          pinned: tab.pinned,
          active: id === this.activeId,
        },
      ]
    })
  }

  getActiveView(): WebContentsView | null {
    if (!this.activeId) return null
    return this.tabs.get(this.activeId)?.view ?? null
  }

  private emitTitle(title: string): void {
    if (!this.win || this.win.isDestroyed()) return
    this.win.webContents.send('browser:title', title)
  }

  private emit(): void {
    if (!this.win || this.win.isDestroyed()) return
    this.win.webContents.send('browser:tabs', this.list())
    const active = this.getActiveView()
    if (active) {
      const title = active.webContents.getTitle()
      this.emitTitle(title)
      this.win.webContents.send('browser:navigated', {
        url: active.webContents.getURL(),
        canGoBack: active.webContents.navigationHistory.canGoBack(),
        canGoForward: active.webContents.navigationHistory.canGoForward(),
        title,
      })
    }
    this.persist()
  }

  private persist(): void {
    const tabs: SavedBrowseTab[] = this.list().map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      pinned: t.pinned,
    }))
    saveSession({ tabs, activeTabId: this.activeId })
  }

  private wireView(tab: TabRecord): void {
    const { view } = tab
    const wc = view.webContents

    wc.setWindowOpenHandler(({ url }) => {
      if (!isAllowedBrowseUrl(url)) return { action: 'deny' }
      void wc.loadURL(url)
      return { action: 'deny' }
    })

    wc.on('will-navigate', (event, url) => {
      if (!isAllowedBrowseUrl(url)) event.preventDefault()
    })

    wc.on('will-redirect', (event, url) => {
      if (!isAllowedBrowseUrl(url)) event.preventDefault()
    })

    const bump = () => {
      tab.title = wc.getTitle() || tab.title
      if (tab.id === this.activeId) this.emit()
      else if (this.win && !this.win.isDestroyed()) {
        this.win.webContents.send('browser:tabs', this.list())
        this.persist()
      }
    }

    wc.on('did-navigate', bump)
    wc.on('did-navigate-in-page', bump)
    wc.on('page-title-updated', (_e, title) => {
      tab.title = title
      if (tab.id === this.activeId) this.emitTitle(title)
      bump()
    })
  }

  private createView(): WebContentsView {
    return new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: 'persist:tabcast-browse',
      },
    })
  }

  isCapturePinned(): boolean {
    return this.capturePinned
  }

  setCapturePinned(pinned: boolean): void {
    this.capturePinned = pinned
    this.layoutActive()
  }

  getActiveCaptureTarget(requester: WebContents): BrowseCaptureInfo | null {
    this.ensureSeeded()
    const view = this.getActiveView()
    if (!view || !this.win || this.win.isDestroyed()) return null

    const wc = view.webContents
    if (wc.isDestroyed()) return null
    const url = wc.getURL()
    if (!url || url === 'about:blank') return null

    const getMediaSourceId = (
      wc as WebContents & { getMediaSourceId?: (requester: WebContents) => string }
    ).getMediaSourceId
    if (typeof getMediaSourceId !== 'function') return null

    try {
      const mediaSourceId = getMediaSourceId.call(wc, requester)
      if (!mediaSourceId) return null
      return {
        mediaSourceId,
        title: wc.getTitle() || 'Browse tab',
        url,
      }
    } catch (err) {
      recordDiagnostic('warn', 'browse.capture', 'getMediaSourceId failed', err)
      return null
    }
  }

  private layoutActive(): void {
    if (!this.win || this.win.isDestroyed()) return
    for (const id of this.order) {
      const tab = this.tabs.get(id)
      if (!tab) continue
      const active = id === this.activeId && (this.visible || this.capturePinned)
      if (active) {
        tab.view.setBounds(this.bounds)
        const v = tab.view as WebContentsView & { setVisible?: (x: boolean) => void }
        v.setVisible?.(true)
      } else {
        tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
        const v = tab.view as WebContentsView & { setVisible?: (x: boolean) => void }
        v.setVisible?.(false)
      }
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.layoutActive()
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.bounds = bounds
    this.layoutActive()
  }

  ensureSeeded(): void {
    if (this.order.length > 0) return
    const saved = loadSession()
    if (saved.tabs.length) {
      for (const t of saved.tabs) {
        this.addTab(t.url || PINNED_PRESETS[0].url, {
          id: t.id,
          title: t.title,
          pinned: Boolean(t.pinned),
          activate: false,
        })
      }
      const preferred =
        saved.activeTabId && this.tabs.has(saved.activeTabId)
          ? saved.activeTabId
          : this.order[0]
      if (preferred) this.activate(preferred)
      return
    }

    for (const pin of PINNED_PRESETS) {
      this.addTab(pin.url, { id: pin.id, title: pin.title, pinned: true, activate: false })
    }
    this.activate(this.order[0])
  }

  addTab(
    url: string,
    opts: { id?: string; title?: string; pinned?: boolean; activate?: boolean } = {},
  ): BrowseTabInfo | null {
    if (!this.win || this.win.isDestroyed()) return null
    const normalized = normalizeBrowseUrl(url)
    if (!normalized) {
      recordDiagnostic('warn', 'browse.blocked', `Blocked URL: ${url}`)
      return null
    }

    const id = opts.id ?? randomUUID()
    if (this.tabs.has(id)) {
      this.activate(id)
      const existing = this.tabs.get(id)!
      void existing.view.webContents.loadURL(normalized)
      return this.list().find((t) => t.id === id) ?? null
    }

    const view = this.createView()
    this.win.contentView.addChildView(view)
    const tab: TabRecord = {
      id,
      pinned: Boolean(opts.pinned),
      title: opts.title ?? 'New Tab',
      view,
    }
    this.wireView(tab)
    this.tabs.set(id, tab)
    this.order.push(id)
    void view.webContents.loadURL(normalized)

    if (opts.activate !== false) this.activate(id)
    else this.layoutActive()

    this.emit()
    return this.list().find((t) => t.id === id) ?? null
  }

  activate(id: string): void {
    if (!this.tabs.has(id)) return
    this.activeId = id
    this.layoutActive()
    this.emit()
  }

  closeTab(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    if (tab.pinned) return
    this.destroyTab(id, true)
  }

  private destroyTab(id: string, emitAfter: boolean): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    try {
      if (this.win && !this.win.isDestroyed()) {
        this.win.contentView.removeChildView(tab.view)
      }
      tab.view.webContents.close()
    } catch {
      // ignore
    }
    this.tabs.delete(id)
    this.order = this.order.filter((x) => x !== id)
    if (this.activeId === id) {
      this.activeId = this.order[this.order.length - 1] ?? null
    }
    this.layoutActive()
    if (emitAfter) this.emit()
  }

  navigateActive(raw: string): string | null {
    const url = normalizeBrowseUrl(raw)
    if (!url) return null
    const view = this.getActiveView()
    if (!view) {
      this.ensureSeeded()
      this.addTab(url)
      return url
    }
    void view.webContents.loadURL(url)
    return url
  }

  back(): void {
    this.getActiveView()?.webContents.navigationHistory.goBack()
  }

  forward(): void {
    this.getActiveView()?.webContents.navigationHistory.goForward()
  }

  reload(): void {
    this.getActiveView()?.webContents.reload()
  }

  activeState() {
    const view = this.getActiveView()
    if (!view) return null
    return {
      url: view.webContents.getURL(),
      title: view.webContents.getTitle(),
      canGoBack: view.webContents.navigationHistory.canGoBack(),
      canGoForward: view.webContents.navigationHistory.canGoForward(),
    }
  }

  openPinned(presetId: string): void {
    const preset = PINNED_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    if (this.tabs.has(preset.id)) {
      this.activate(preset.id)
      return
    }
    this.addTab(preset.url, {
      id: preset.id,
      title: preset.title,
      pinned: true,
    })
  }
}
