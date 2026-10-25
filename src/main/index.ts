import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  protocol,
  session,
  shell,
} from 'electron'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { RelayManager, detectOrphanRelayProcesses } from './relay'
import { BrowseTabsManager, PINNED_PRESETS, normalizeBrowseUrl } from './browse-tabs'
import { AddonHost } from './addon-host'
import { AddonRuntime } from './addon-runtime'
import { createAppTray, destroyAppTray, maybeMinimizeToTray, rebuildTrayMenu, appIconPath } from './tray'
import { loadSettings, saveSettings } from './settings-store'
import {
  clearDiagnostics,
  exportDiagnosticsBundle,
  getDiagnostics,
  installProcessGuards,
  onDiagnostic,
  recordDiagnostic,
} from './diagnostics'
import { isAllowedBrowseUrl } from '../shared/browse-url'
import { BROWSE_CAPTURE_SOURCE_ID } from '../shared/capture'
import { coerceSettings, isStudioMediaPermission, isValidPresetId, isValidTabId } from './security'
import { addonHasPermission, isValidAddonId, isValidCatalogId } from '../shared/addon-api'
import { PHONE_CAM_ADDON_ID } from '../shared/phone-pair'
import { addonProfileBucket, normalizeEncodeProfileId } from '../shared/stream-encode-profiles'

function profileBucketForAddon(profileRaw: string | undefined): '720p' | '1080p' {
  if (profileRaw === '1080p') return '1080p'
  if (profileRaw === '720p') return '720p'
  if (profileRaw) return addonProfileBucket(normalizeEncodeProfileId(profileRaw))
  return '720p'
}
import { assertStudioSender, ipcTry, sanitizeChatUrlInput, sanitizeNavigateInput } from './ipc-guards'
import type { AddonFetchInit } from '../shared/addon-runtime'
import { ADDON_PROTOCOL } from '../shared/addon-runtime'
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateStatus,
  initAutoUpdate,
  installUpdate,
} from './auto-update'
import { PhonePairServer, phoneWebRtcIceServersForSession } from './phone-pair'
import { pickSceneImageFile, readSceneImageDataUrl } from './scene-image-io'
import { saveRecordingWithDialog } from './recording-io'

protocol.registerSchemesAsPrivileged([
  {
    scheme: ADDON_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: false,
      corsEnabled: true,
    },
  },
])

const isDev = !app.isPackaged
const relay = new RelayManager()
const phonePair = new PhonePairServer()
const browse = new BrowseTabsManager()
const addonRuntime = new AddonRuntime()
const addonHost = new AddonHost(addonRuntime)

let relayWasReady = false

let mainWindow: BrowserWindow | null = null
let chatWindow: BrowserWindow | null = null
let appMode: 'studio' | 'browse' = 'studio'
let settings = loadSettings()
let quitInProgress = false
let quitReadyResolve: (() => void) | null = null

const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = mainWindow
    if (!win || win.isDestroyed()) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
}

const TITLEBAR = 40
const CHROME_STUDIO_TOP = TITLEBAR
const BROWSE_TABSTRIP = 36
const BROWSE_NAV = 44
const CHROME_BROWSE_TOP = TITLEBAR + BROWSE_TABSTRIP + BROWSE_NAV
const SIDEBAR_LEFT = 280
const SIDEBAR_RIGHT = 300

function preloadPath(): string {
  const mjs = join(__dirname, '../preload/index.mjs')
  const js = join(__dirname, '../preload/index.js')
  return existsSync(mjs) ? mjs : js
}

function addonPreloadPath(): string {
  const mjs = join(__dirname, '../preload/addon-bridge.mjs')
  const js = join(__dirname, '../preload/addon-bridge.js')
  return existsSync(mjs) ? mjs : js
}

function allowCapturePermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(isStudioMediaPermission(String(permission)))
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return isStudioMediaPermission(String(permission))
  })

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void desktopCapturer
      .getSources({ types: ['screen', 'window'] })
      .then((sources) => {
        const screen = sources.find((s) => s.id.startsWith('screen:'))
        const pick = screen ?? sources[0]
        if (!pick) {
          callback({})
          return
        }
        callback({ video: pick, audio: 'loopback' })
      })
      .catch(() => callback({}))
  })
}

function neutralizeInstalledRelayConfig(): void {
  const localApp = process.env.LOCALAPPDATA
  if (!localApp) return
  const dir = join(localApp, 'TabcastRelay', 'v0.1.0')
  const configPath = join(dir, 'relay-config.json')
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      configPath,
      JSON.stringify({ streamUrl: 'http://127.0.0.1:38473/whip' }, null, 2) + '\n',
      'utf8',
    )
  } catch {
    // non-fatal
  }
}

function loadAppUi(win: BrowserWindow): void {
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/app.html`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/app.html'))
  }
}

function layoutBrowserPane(win: BrowserWindow): void {
  const browseChrome =
    appMode === 'browse' || browse.isCapturePinned()

  if (!browseChrome) {
    browse.setVisible(false)
    browse.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    return
  }

  browse.ensureSeeded()
  browse.setVisible(appMode === 'browse')
  const [width, height] = win.getContentSize()
  const fullWidthBrowse = appMode === 'browse'
  const paneLeft = fullWidthBrowse ? 0 : SIDEBAR_LEFT
  const paneWidth = fullWidthBrowse
    ? width
    : Math.max(320, width - SIDEBAR_LEFT - SIDEBAR_RIGHT)
  browse.setBounds({
    x: paneLeft,
    y: appMode === 'browse' ? CHROME_BROWSE_TOP : CHROME_STUDIO_TOP,
    width: paneWidth,
    height: Math.max(240, height - (appMode === 'browse' ? CHROME_BROWSE_TOP : CHROME_STUDIO_TOP)),
  })
}

function setAppMode(mode: 'studio' | 'browse'): void {
  appMode = mode
  if (mode === 'browse' && mainWindow && !mainWindow.isDestroyed()) {
    browse.attach(mainWindow)
    browse.ensureSeeded()
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    layoutBrowserPane(mainWindow)
    mainWindow.webContents.send('app:mode', mode)
    if (mode === 'browse') {
      mainWindow.webContents.send('browser:tabs', browse.list())
      if (settings.openChatOnBrowse) {
        openChatPopout(chatUrlFromBrowse())
      }
    }
  }
}

/** Prefer channel chat when the active browse tab is a Twitch or YouTube live page. */
function chatUrlFromBrowse(): string | undefined {
  const state = browse.activeState()
  if (!state?.url) return undefined
  try {
    const u = new URL(state.url)
    const host = u.hostname.toLowerCase()

    if (host.endsWith('twitch.tv')) {
      const [segment] = u.pathname.split('/').filter(Boolean)
      if (!segment || segment === 'directory' || segment === 'popout' || segment === 'videos') {
        return undefined
      }
      return `https://www.twitch.tv/popout/${segment}/chat?popout=`
    }

    if (host === 'youtu.be') {
      const videoId = u.pathname.split('/').filter(Boolean)[0]
      if (videoId) {
        return `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&is_popout=1`
      }
    }

    if (host.endsWith('youtube.com')) {
      const videoId = u.searchParams.get('v')
      if (videoId) {
        return `https://www.youtube.com/live_chat?v=${encodeURIComponent(videoId)}&is_popout=1`
      }
      if (host === 'studio.youtube.com') {
        return 'https://studio.youtube.com/livestreaming/chat'
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

function openChatPopout(url?: string): void {
  const target =
    (url ? normalizeBrowseUrl(url) : null) ||
    chatUrlFromBrowse() ||
    normalizeBrowseUrl('https://www.twitch.tv/directory') ||
    'https://www.twitch.tv/popout/directory/chat?popout='

  if (chatWindow && !chatWindow.isDestroyed()) {
    void chatWindow.loadURL(target)
    chatWindow.show()
    chatWindow.focus()
    return
  }

  chatWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 320,
    minHeight: 480,
    backgroundColor: '#07070a',
    title: 'Maka Chat',
    autoHideMenuBar: true,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: 'persist:tabcast-browse',
    },
  })

  chatWindow.on('closed', () => {
    chatWindow = null
  })

  chatWindow.webContents.setWindowOpenHandler(({ url: next }) => {
    if (!isAllowedBrowseUrl(next)) return { action: 'deny' }
    void chatWindow?.loadURL(next)
    return { action: 'deny' }
  })

  chatWindow.webContents.on('will-navigate', (event, next) => {
    if (!isAllowedBrowseUrl(next)) event.preventDefault()
  })

  chatWindow.webContents.on('will-redirect', (event, next) => {
    if (!isAllowedBrowseUrl(next)) event.preventDefault()
  })

  void chatWindow.loadURL(target)
  recordDiagnostic('info', 'chat.popout', `Opened chat popout: ${target}`)
}

function createMainWindow(): BrowserWindow {
  settings = loadSettings()
  appMode = settings.startupMode

  const win = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1280,
    minHeight: 760,
    backgroundColor: '#faf8f4',
    title: 'Maka',
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    icon: appIconPath(),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  })

  browse.attach(win)
  loadAppUi(win)

  win.once('ready-to-show', () => {
    win.show()
    setAppMode(appMode)
    const capturePath = process.env.MAKA_CAPTURE_PATH
    if (capturePath) {
      setTimeout(() => {
        void win.webContents
          .capturePage()
          .then((image) => {
            mkdirSync(dirname(capturePath), { recursive: true })
            writeFileSync(capturePath, image.toPNG())
            recordDiagnostic('info', 'app.capture', `Wrote UI capture to ${capturePath}`)
            app.exit(0)
          })
          .catch((err) => {
            recordDiagnostic('error', 'app.capture', 'UI capture failed', err)
            app.exit(1)
          })
      }, 1200)
    }
  })

  win.on('resize', () => layoutBrowserPane(win))
  win.on('closed', () => {
    browse.detach()
    mainWindow = null
  })

  win.on('close', (event) => {
    const live = relay.getSnapshot().lifecycle === 'live'
    if (maybeMinimizeToTray(win, settings.minimizeToTrayWhileLive, live)) {
      event.preventDefault()
    }
  })

  win.webContents.on('render-process-gone', (_e, details) => {
    recordDiagnostic('fatal', 'renderer.gone', 'Renderer process gone', undefined, {
      reason: details.reason,
      exitCode: details.exitCode,
    })
    if (details.reason !== 'clean-exit') {
      setTimeout(() => {
        if (!win.isDestroyed()) {
          recordDiagnostic('warn', 'renderer.reload', 'Reloading UI after renderer crash')
          loadAppUi(win)
        }
      }, 800)
    }
  })

  win.webContents.on('unresponsive', () => {
    recordDiagnostic('error', 'renderer.unresponsive', 'Main UI became unresponsive')
  })

  win.webContents.on('responsive', () => {
    recordDiagnostic('info', 'renderer.responsive', 'Main UI responsive again')
  })

  return win
}

function broadcastRelay(): void {
  const snapshot = relay.getSnapshot()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('relay:update', snapshot)
  }
  if (snapshot.lifecycle === 'ready' || snapshot.lifecycle === 'live') {
    if (!relayWasReady) {
      relayWasReady = true
      addonRuntime.broadcastLiveEvent(addonHost, { event: 'app.ready' })
    }
  } else if (snapshot.lifecycle === 'stopped' || snapshot.lifecycle === 'error') {
    relayWasReady = false
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    const label =
      snapshot.lifecycle === 'live'
        ? 'LIVE'
        : snapshot.lifecycle === 'ready'
          ? 'Ready'
          : snapshot.lifecycle === 'starting'
            ? 'Starting…'
            : snapshot.lifecycle === 'error'
              ? 'Error'
              : 'Offline'
    mainWindow.setTitle(`Maka — ${label}`)
  }
  rebuildTrayMenu()
}

function broadcastPhonePair(): void {
  const snapshot = phonePair.getSnapshot()
  addonRuntime.broadcastPhonePair(addonHost, snapshot)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('phone-pair:update', snapshot)
  }
}

function isPhonePairAddonActive(): boolean {
  const manifest = addonHost.getManifest(PHONE_CAM_ADDON_ID)
  return Boolean(manifest && addonHost.isAddonActive(PHONE_CAM_ADDON_ID))
}

async function syncPhonePairServer(): Promise<void> {
  if (isPhonePairAddonActive()) {
    try {
      await phonePair.start()
    } catch (err) {
      recordDiagnostic('error', 'phone-pair', 'Phone pair server failed to start', err)
    }
  } else {
    phonePair.unpair()
    await phonePair.stop()
  }
}

function isStudioSender(sender: Electron.WebContents): boolean {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && sender === mainWindow.webContents)
}

function studioOk(event: Electron.IpcMainInvokeEvent): boolean {
  return assertStudioSender(event.sender, isStudioSender)
}

function addonRuntimeContext(event: Electron.IpcMainInvokeEvent) {
  const addonId = addonRuntime.addonIdFromSender(event.sender, addonHost)
  if (!addonId) return null
  const manifest = addonHost.getManifest(addonId)
  if (!manifest || !addonHost.isAddonActive(addonId)) return null
  addonRuntime.trackWebContents(event.sender)
  return { addonId, manifest }
}

function phonePairAddonContext(event: Electron.IpcMainInvokeEvent) {
  const ctx = addonRuntimeContext(event)
  if (!ctx) return null
  if (ctx.addonId !== PHONE_CAM_ADDON_ID) return null
  if (!addonHasPermission(ctx.manifest, 'device.phone-pair')) return null
  return ctx
}

function registerIpc(): void {
  ipcMain.handle('addon-runtime:phone-pair:get', (event) => {
    if (!phonePairAddonContext(event)) throw new Error('Unauthorized')
    return phonePair.getSnapshot()
  })
  ipcMain.handle('addon-runtime:phone-pair:refresh', (event) => {
    if (!phonePairAddonContext(event)) throw new Error('Unauthorized')
    return phonePair.refresh()
  })
  ipcMain.handle('addon-runtime:phone-pair:unpair', (event) => {
    if (!phonePairAddonContext(event)) throw new Error('Unauthorized')
    return phonePair.unpair()
  })

  ipcMain.handle('phone-pair:get', (event) => {
    if (!studioOk(event)) throw new Error('Unauthorized')
    return phonePair.getSnapshot()
  })

  ipcMain.handle('phone-pair:webrtc-answer', (event, answer: { type?: string; sdp?: string }) => {
    if (!studioOk(event)) throw new Error('Unauthorized')
    if (answer?.type !== 'answer' || typeof answer.sdp !== 'string') {
      return { ok: false }
    }
    phonePair.setWebRtcAnswer({ type: 'answer', sdp: answer.sdp })
    return { ok: true }
  })

  ipcMain.handle('phone-pair:ice-servers', (event) => {
    if (!studioOk(event)) throw new Error('Unauthorized')
    return phoneWebRtcIceServersForSession()
  })

  ipcMain.handle('relay:get', () => relay.getSnapshot())
  ipcMain.handle('relay:start', async (event) => {
    if (!studioOk(event)) return relay.getSnapshot()
    return ipcTry('ipc.relay.start', async () => {
      await relay.start()
      return relay.getSnapshot()
    }, relay.getSnapshot())
  })
  ipcMain.handle('relay:stop', async (event) => {
    if (!studioOk(event)) return relay.getSnapshot()
    return ipcTry('ipc.relay.stop', async () => {
      await relay.stop()
      return relay.getSnapshot()
    }, relay.getSnapshot())
  })
  ipcMain.handle('relay:refresh', async (event) => {
    if (!studioOk(event)) return relay.getSnapshot()
    return ipcTry('ipc.relay.refresh', async () => {
      await relay.refresh()
      return relay.getSnapshot()
    }, relay.getSnapshot())
  })
  ipcMain.handle('relay:reveal', (event) => {
    if (!studioOk(event)) return relay.getExePath()
    const path = relay.getExePath()
    shell.showItemInFolder(path)
    return path
  })

  ipcMain.handle('app:get-mode', () => appMode)
  ipcMain.handle('app:set-mode', (event, mode: 'studio' | 'browse') => {
    if (!studioOk(event)) return appMode
    if (mode !== 'studio' && mode !== 'browse') return appMode
    setAppMode(mode)
    return appMode
  })

  ipcMain.handle('window:minimize', (event) => {
    if (!studioOk(event)) return
    mainWindow?.minimize()
  })
  ipcMain.handle('window:maximize', (event) => {
    if (!studioOk(event)) return false
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('window:close', (event) => {
    if (!studioOk(event)) return
    mainWindow?.close()
  })

  ipcMain.handle('shell:open-stream', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      setAppMode('studio')
    }
  })

  ipcMain.handle('shell:open-home', () => {
    void shell.openExternal('https://tabcast.live')
  })

  ipcMain.handle('settings:get', (event) => {
    if (!studioOk(event)) return loadSettings()
    return loadSettings()
  })
  ipcMain.handle('settings:set', (event, partial: unknown) => {
    if (!studioOk(event)) return settings
    settings = saveSettings(coerceSettings(partial))
    return settings
  })

  ipcMain.handle('scene:pick-image', async (event) => {
    if (!studioOk(event)) return { canceled: true }
    const win = BrowserWindow.fromWebContents(event.sender)
    return pickSceneImageFile(win)
  })

  ipcMain.handle('recording:save', async (event, payload: unknown) => {
    if (!studioOk(event)) return { canceled: true }
    if (!payload || typeof payload !== 'object') return { canceled: true }
    const p = payload as Record<string, unknown>
    const data = p.data
    const defaultName = typeof p.defaultName === 'string' ? p.defaultName.slice(0, 200) : 'maka-recording.webm'
    const ext = p.ext === 'mp4' ? 'mp4' : 'webm'
    if (!(data instanceof ArrayBuffer) && !Buffer.isBuffer(data)) {
      return { canceled: true }
    }
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data)
    if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024 * 1024) {
      return { canceled: true }
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    return saveRecordingWithDialog(win, defaultName, bytes, ext)
  })

  ipcMain.handle('scene:read-image-data-url', (event, filePath: unknown) => {
    if (!studioOk(event)) return null
    if (typeof filePath !== 'string' || !filePath.trim()) return null
    return readSceneImageDataUrl(filePath.trim())
  })

  ipcMain.handle('browser:navigate', (event, raw: unknown) => {
    if (!studioOk(event) || !mainWindow) return null
    browse.attach(mainWindow)
    setAppMode('browse')
    return browse.navigateActive(sanitizeNavigateInput(raw))
  })
  ipcMain.handle('browser:back', (event) => {
    if (!studioOk(event)) return
    browse.back()
  })
  ipcMain.handle('browser:forward', (event) => {
    if (!studioOk(event)) return
    browse.forward()
  })
  ipcMain.handle('browser:reload', (event) => {
    if (!studioOk(event)) return
    browse.reload()
  })
  ipcMain.handle('browser:state', (event) => {
    if (!studioOk(event)) return null
    return browse.activeState()
  })
  ipcMain.handle('browser:tabs', (event) => {
    if (!studioOk(event)) return []
    return browse.list()
  })
  ipcMain.handle('browser:new-tab', (event, url?: unknown) => {
    if (!studioOk(event) || !mainWindow) return null
    browse.attach(mainWindow)
    setAppMode('browse')
    const normalized = url ? normalizeBrowseUrl(sanitizeNavigateInput(url)) : null
    return browse.addTab(normalized || 'https://www.twitch.tv/directory')
  })
  ipcMain.handle('browser:activate-tab', (event, id: unknown) => {
    if (!studioOk(event)) return browse.list()
    if (!isValidTabId(id)) return browse.list()
    browse.activate(id)
    return browse.list()
  })
  ipcMain.handle('browser:close-tab', (event, id: unknown) => {
    if (!studioOk(event)) return browse.list()
    if (!isValidTabId(id)) return browse.list()
    browse.closeTab(id)
    return browse.list()
  })
  ipcMain.handle('browser:open-pinned', (event, presetId: unknown) => {
    if (!studioOk(event)) return browse.list()
    if (!isValidPresetId(presetId)) return browse.list()
    if (!mainWindow) return browse.list()
    browse.attach(mainWindow)
    setAppMode('browse')
    browse.openPinned(presetId)
    return browse.list()
  })
  ipcMain.handle('browser:presets', (event) => {
    if (!studioOk(event)) return []
    return PINNED_PRESETS
  })
  ipcMain.handle('browser:popout-chat', (event, url?: unknown) => {
    if (!studioOk(event)) return
    openChatPopout(sanitizeChatUrlInput(url))
  })

  ipcMain.handle('capture:list-sources', async (event) => {
    if (!studioOk(event)) return []
    return ipcTry('ipc.capture.list', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    })
    type CaptureSourceDto = {
      id: string
      name: string
      type: 'screen' | 'window' | 'browser'
      thumbnailDataUrl: string
    }

    const mapped: CaptureSourceDto[] = sources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.id.startsWith('screen') ? ('screen' as const) : ('window' as const),
      thumbnailDataUrl: s.thumbnail.toDataURL(),
    }))

    if (mainWindow && !mainWindow.isDestroyed()) {
      browse.attach(mainWindow)
      browse.ensureSeeded()
      const target = browse.getActiveCaptureTarget(mainWindow.webContents)
      if (target) {
        mapped.unshift({
          id: BROWSE_CAPTURE_SOURCE_ID,
          name: `Browse: ${target.title}`,
          type: 'browser' as const,
          thumbnailDataUrl: '',
        })
      }
    }

    return mapped
    }, [])
  })

  ipcMain.handle('capture:get-browse-target', (event) => {
    if (!studioOk(event) || !mainWindow) return null
    browse.attach(mainWindow)
    browse.ensureSeeded()
    layoutBrowserPane(mainWindow)
    browse.setCapturePinned(true)
    return browse.getActiveCaptureTarget(mainWindow.webContents)
  })

  ipcMain.handle('capture:set-browse-capture-active', (event, active: unknown) => {
    if (!studioOk(event)) return false
    const pinned = Boolean(active)
    browse.setCapturePinned(pinned)
    if (mainWindow && !mainWindow.isDestroyed()) {
      layoutBrowserPane(mainWindow)
    }
    return pinned
  })

  ipcMain.handle('addons:list-panels', (event) => {
    if (!studioOk(event)) return []
    return addonHost.listPanels()
  })

  ipcMain.handle('addons:list-marketplace', (event) => {
    if (!studioOk(event)) return []
    return addonHost.listMarketplace()
  })

  ipcMain.handle('addons:refresh-marketplace', async (event) => {
    if (!studioOk(event)) return []
    return ipcTry('ipc.addons.refresh-marketplace', () => addonHost.refreshMarketplace(), [])
  })

  ipcMain.handle('addons:get-settings', (event, addonId: unknown) => {
    if (!studioOk(event)) return {}
    if (!isValidAddonId(addonId)) return {}
    return addonHost.getAddonSettings(addonId)
  })

  ipcMain.handle('addons:set-settings', (event, addonId: unknown, partial: unknown) => {
    if (!studioOk(event)) return { ok: false, message: 'Unauthorized' }
    if (!isValidAddonId(addonId)) return { ok: false, message: 'Invalid addon id' }
    return ipcTry(
      'ipc.addons.set-settings',
      () => addonHost.setAddonSettings(addonId, partial),
      { ok: false, message: 'Settings save failed' },
    )
  })

  ipcMain.handle('addons:dispatch-live-event', async (event, liveEvent: unknown, ctx: unknown) => {
    if (!studioOk(event)) return []
    if (liveEvent !== 'live.start' && liveEvent !== 'live.end') return []
    const profileRaw =
      ctx && typeof ctx === 'object' ? (ctx as { profile?: string }).profile : undefined
    const profile = profileBucketForAddon(profileRaw)
    const platformsRaw =
      ctx && typeof ctx === 'object' ? (ctx as { platforms?: unknown }).platforms : undefined
    const platforms =
      platformsRaw && typeof platformsRaw === 'object'
        ? {
            twitch: Boolean((platformsRaw as { twitch?: boolean }).twitch),
            youtube: Boolean((platformsRaw as { youtube?: boolean }).youtube),
            custom: Boolean((platformsRaw as { custom?: boolean }).custom),
          }
        : undefined
    return ipcTry(
      'ipc.addons.dispatch-live-event',
      async () => {
        const results = await addonHost.dispatchLiveEvent(liveEvent, { profile, platforms })
        addonRuntime.broadcastLiveEvent(addonHost, { event: liveEvent, profile, platforms })
        return results
      },
      [],
    )
  })

  ipcMain.handle('addons:get-preload-path', (event) => {
    if (!studioOk(event)) return ''
    return addonPreloadPath()
  })

  ipcMain.handle('addon-runtime:get-info', (event) => {
    const ctx = addonRuntimeContext(event)
    if (!ctx) return null
    return addonRuntime.getInfo(ctx.manifest)
  })

  ipcMain.handle('addon-runtime:toast', (event, message: unknown) => {
    const ctx = addonRuntimeContext(event)
    if (!ctx) return { ok: false }
    try {
      addonRuntime.toast(ctx.manifest, typeof message === 'string' ? message : 'OK')
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('addon-runtime:studio-toast', String(message).slice(0, 500))
      }
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle('addon-runtime:fetch', async (event, url: unknown, init: unknown) => {
    const ctx = addonRuntimeContext(event)
    if (!ctx) return { ok: false, status: 403, body: 'Unauthorized' }
    return ipcTry(
      'addon-runtime.fetch',
      () => addonRuntime.fetch(ctx.manifest, String(url ?? ''), init as AddonFetchInit),
      { ok: false, status: 500, body: 'Fetch failed' },
    )
  })

  ipcMain.handle('addon-runtime:get-settings', (event) => {
    const ctx = addonRuntimeContext(event)
    if (!ctx) return {}
    return addonRuntime.getSettings(ctx.addonId)
  })

  ipcMain.handle('addon-runtime:set-settings', (event, partial: unknown) => {
    const ctx = addonRuntimeContext(event)
    if (!ctx) return { ok: false }
    try {
      addonRuntime.setSettings(ctx.addonId, partial)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle('addon-runtime:open-external', (event, url: unknown) => {
    const ctx = addonRuntimeContext(event)
    if (!ctx) return { ok: false }
    try {
      addonRuntime.openExternal(ctx.manifest, String(url ?? ''))
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle('addons:install', async (event, catalogId: unknown) => {
    if (!studioOk(event)) return { ok: false, message: 'Unauthorized' }
    if (!isValidCatalogId(catalogId)) return { ok: false, message: 'Invalid catalog id' }
    const result = await ipcTry('ipc.addons.install', () => addonHost.install(catalogId), {
      ok: false,
      message: 'Install failed',
    })
    if (result.ok) await syncPhonePairServer()
    return result
  })

  ipcMain.handle('addons:uninstall', async (event, addonId: unknown) => {
    if (!studioOk(event)) return { ok: false, message: 'Unauthorized' }
    if (!isValidAddonId(addonId)) return { ok: false, message: 'Invalid addon id' }
    const result = await ipcTry('ipc.addons.uninstall', () => addonHost.uninstall(addonId), {
      ok: false,
      message: 'Uninstall failed',
    })
    if (result.ok) await syncPhonePairServer()
    return result
  })

  ipcMain.handle('addons:set-enabled', async (event, addonId: unknown, enabled: unknown) => {
    if (!studioOk(event)) return { ok: false, message: 'Unauthorized' }
    if (!isValidAddonId(addonId)) return { ok: false, message: 'Invalid addon id' }
    const result = await ipcTry(
      'ipc.addons.set-enabled',
      () => addonHost.setEnabled(addonId, Boolean(enabled)),
      { ok: false, message: 'Update failed' },
    )
    if (result.ok) await syncPhonePairServer()
    return result
  })

  ipcMain.handle('addons:reload', async (event) => {
    if (!studioOk(event)) return false
    const ok = await ipcTry(
      'ipc.addons.reload',
      () => {
        addonHost.reload()
        return true
      },
      false,
    )
    if (ok) await syncPhonePairServer()
    return ok
  })

  ipcMain.handle(
    'addons:run-action',
    (event, addonId: unknown, actionId: unknown, ctx: unknown) => {
      if (!studioOk(event)) {
        return { ok: false, message: 'Unauthorized' }
      }
      if (typeof addonId !== 'string' || typeof actionId !== 'string') {
        return { ok: false, message: 'Invalid addon action' }
      }
      if (!isValidAddonId(addonId)) {
        return { ok: false, message: 'Invalid addon id' }
      }
      const profileRaw =
        ctx && typeof ctx === 'object' ? (ctx as { profile?: string }).profile : undefined
      const profile = normalizeEncodeProfileId(profileRaw)
      const hasWebcam = Boolean(
        ctx && typeof ctx === 'object' && (ctx as { hasWebcam?: boolean }).hasWebcam,
      )
      return ipcTry(
        'ipc.addons.run-action',
        () => addonHost.runAction(addonId, actionId, { profile, hasWebcam }),
        { ok: false, message: 'Addon action failed' },
      )
    },
  )

  ipcMain.handle('diagnostics:list', (event) => {
    if (!studioOk(event)) return []
    return getDiagnostics()
  })
  ipcMain.handle('diagnostics:clear', (event) => {
    if (!studioOk(event)) return []
    clearDiagnostics()
    return getDiagnostics()
  })
  ipcMain.handle('diagnostics:export', (event) => {
    if (!studioOk(event)) return ''
    return exportDiagnosticsBundle()
  })
  ipcMain.handle('diagnostics:verify', async (event) => {
    if (!studioOk(event)) {
      return { ok: false, checks: [], snapshot: relay.getSnapshot(), diagnostics: [] }
    }
    return ipcTry(
      'ipc.diagnostics.verify',
      async () => {
    const checks: Array<{ name: string; ok: boolean; detail: string }> = []
    const exe = relay.getExePath()
    const snap = relay.getSnapshot()
    checks.push({
      name: 'relay-binary',
      ok: !!(exe && existsSync(exe)),
      detail: exe,
    })
    checks.push({
      name: 'relay-lifecycle',
      ok: snap.lifecycle === 'ready' || snap.lifecycle === 'live',
      detail: snap.lifecycle + (snap.error ? ` — ${snap.error}` : ''),
    })
    try {
      const res = await fetch('http://127.0.0.1:38473/health', {
        signal: AbortSignal.timeout(4000),
      })
      checks.push({ name: 'relay-health', ok: res.ok, detail: `HTTP ${res.status}` })
    } catch (err) {
      checks.push({
        name: 'relay-health',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      })
    }
    checks.push({
      name: 'studio-window',
      ok: !!(mainWindow && !mainWindow.isDestroyed()),
      detail: mainWindow ? 'open' : 'missing',
    })

    const orphan = await detectOrphanRelayProcesses(snap.pid)
    checks.push({
      name: 'relay-orphans',
      ok: orphan.orphanCount === 0 && !orphan.portConflict,
      detail:
        orphan.orphanCount === 0 && !orphan.portConflict
          ? orphan.totalCount
            ? `${orphan.totalCount} relay process(es), none orphaned`
            : 'no stray TabcastRelay.exe'
          : [
              orphan.orphanCount ? `${orphan.orphanCount} orphan PID(s): ${orphan.orphanPids.join(', ')}` : null,
              orphan.portConflict ? `port ${38473} held by PID ${orphan.portListenerPid}` : null,
            ]
              .filter(Boolean)
              .join('; '),
    })

    const ok = checks.every((c) => c.ok)
    recordDiagnostic(ok ? 'info' : 'warn', 'verify', ok ? 'Verification passed' : 'Verification failed', undefined, {
      checks,
    })
    return { ok, checks, snapshot: snap, diagnostics: getDiagnostics().slice(-20) }
      },
      { ok: false, checks: [], snapshot: relay.getSnapshot(), diagnostics: getDiagnostics().slice(-20) },
    )
  })

  ipcMain.handle('layout:metrics', (event) => {
    if (!studioOk(event)) {
      return { mode: appMode, top: CHROME_STUDIO_TOP, left: SIDEBAR_LEFT, right: SIDEBAR_RIGHT }
    }
    const fullWidthBrowse = appMode === 'browse'
    return {
      mode: appMode,
      top: appMode === 'browse' ? CHROME_BROWSE_TOP : CHROME_STUDIO_TOP,
      left: fullWidthBrowse ? 0 : SIDEBAR_LEFT,
      right: fullWidthBrowse ? 0 : SIDEBAR_RIGHT,
    }
  })

  ipcMain.on('app:prepare-quit-done', () => {
    quitReadyResolve?.()
    quitReadyResolve = null
  })

  ipcMain.handle('app:update-status', (event) => {
    if (!studioOk(event)) return getUpdateStatus()
    return getUpdateStatus()
  })
  ipcMain.handle('app:check-updates', async (event) => {
    if (!studioOk(event)) return getUpdateStatus()
    return checkForUpdates()
  })
  ipcMain.handle('app:download-update', async (event) => {
    if (!studioOk(event)) return getUpdateStatus()
    return downloadUpdate()
  })
  ipcMain.handle('app:install-update', (event) => {
    if (!studioOk(event)) return
    installUpdate()
  })
}

function waitForRendererQuitReady(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    quitReadyResolve = resolve
    setTimeout(() => {
      if (quitReadyResolve === resolve) {
        quitReadyResolve = null
        resolve()
      }
    }, timeoutMs)
  })
}

async function shutdownApp(): Promise<void> {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:prepare-quit')
    await waitForRendererQuitReady(6000)
  }

  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.close()
    chatWindow = null
  }

  browse.detach()
  browse.setCapturePinned(false)
  destroyAppTray()
  await phonePair.stop()
  await relay.stop()
}

app.whenReady().then(() => {
  installProcessGuards((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('diagnostics:event', event)
    }
  })
  recordDiagnostic('info', 'app.boot', 'Maka 0.2 starting')

  allowCapturePermissions()
  neutralizeInstalledRelayConfig()
  addonRuntime.registerProtocol(addonHost)
  addonHost.boot()
  registerIpc()
  createAppTray({
    getMain: () => mainWindow,
    getIsLive: () => {
      const snap = relay.getSnapshot()
      return snap.lifecycle === 'live'
    },
  })
  initAutoUpdate(() => mainWindow)
  relay.subscribe(() => broadcastRelay())
  phonePair.subscribe(() => broadcastPhonePair())
  phonePair.onWebRtcOffer((offer) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('phone-pair:webrtc-offer', offer)
    }
  })
  phonePair.onWebRtcReset(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('phone-pair:webrtc-reset')
    }
  })
  void syncPhonePairServer()
  onDiagnostic((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('diagnostics:event', event)
    }
  })

  mainWindow = createMainWindow()

  void relay.start().catch((err) => {
    recordDiagnostic('error', 'relay.start', 'Initial relay start failed', err)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (quitInProgress) return
  event.preventDefault()
  quitInProgress = true
  recordDiagnostic('info', 'app.quit', 'App quitting — tearing down live session and relay')
  void shutdownApp()
    .catch((err) => {
      recordDiagnostic('error', 'app.quit', 'Shutdown error', err)
    })
    .finally(() => {
      app.exit(0)
    })
})
