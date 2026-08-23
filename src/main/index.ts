import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  session,
  shell,
} from 'electron'
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { RelayManager } from './relay'
import { BrowseTabsManager, PINNED_PRESETS, normalizeBrowseUrl } from './browse-tabs'
import { createAppTray, destroyAppTray, maybeMinimizeToTray } from './tray'
import { loadSettings, saveSettings } from './settings-store'
import {
  clearDiagnostics,
  exportDiagnosticsBundle,
  getDiagnostics,
  installProcessGuards,
  onDiagnostic,
  recordDiagnostic,
} from './diagnostics'
import { isBlockedHost } from '../shared/tabcast'

const isDev = !app.isPackaged
const relay = new RelayManager()
const browse = new BrowseTabsManager()

let mainWindow: BrowserWindow | null = null
let chatWindow: BrowserWindow | null = null
let appMode: 'studio' | 'browse' = 'studio'
let settings = loadSettings()

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

function allowCapturePermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = new Set(['media', 'display-capture', 'mediaKeySystem', 'notifications'])
    callback(allowed.has(permission))
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return (
      permission === 'media' ||
      permission === 'display-capture' ||
      permission === 'mediaKeySystem'
    )
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
  if (appMode !== 'browse') {
    browse.setVisible(false)
    browse.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    return
  }

  browse.ensureSeeded()
  browse.setVisible(true)
  const [width, height] = win.getContentSize()
  browse.setBounds({
    x: SIDEBAR_LEFT,
    y: CHROME_BROWSE_TOP,
    width: Math.max(320, width - SIDEBAR_LEFT - SIDEBAR_RIGHT),
    height: Math.max(240, height - CHROME_BROWSE_TOP),
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
    }
  }
}

function openChatPopout(url?: string): void {
  const target =
    normalizeBrowseUrl(url || 'https://www.twitch.tv/directory') ||
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
    title: 'Tabcast Chat',
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
    try {
      const host = new URL(next).hostname
      if (isBlockedHost(host)) return { action: 'deny' }
    } catch {
      return { action: 'deny' }
    }
    void chatWindow?.loadURL(next)
    return { action: 'deny' }
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
    backgroundColor: '#07070a',
    title: 'Tabcast',
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  browse.attach(win)
  loadAppUi(win)

  win.once('ready-to-show', () => {
    win.show()
    setAppMode(appMode)
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
    mainWindow.setTitle(`Tabcast — ${label}`)
  }
}

function registerIpc(): void {
  ipcMain.handle('relay:get', () => relay.getSnapshot())
  ipcMain.handle('relay:start', async () => {
    await relay.start()
    return relay.getSnapshot()
  })
  ipcMain.handle('relay:stop', async () => {
    await relay.stop()
    return relay.getSnapshot()
  })
  ipcMain.handle('relay:refresh', async () => {
    await relay.refresh()
    return relay.getSnapshot()
  })
  ipcMain.handle('relay:reveal', () => {
    const path = relay.getExePath()
    shell.showItemInFolder(path)
    return path
  })

  ipcMain.handle('app:get-mode', () => appMode)
  ipcMain.handle('app:set-mode', (_e, mode: 'studio' | 'browse') => {
    if (mode !== 'studio' && mode !== 'browse') return appMode
    setAppMode(mode)
    return appMode
  })

  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())

  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:set', (_e, partial: Partial<typeof settings>) => {
    settings = saveSettings(partial)
    return settings
  })

  ipcMain.handle('browser:navigate', (_e, raw: string) => {
    if (!mainWindow) return null
    browse.attach(mainWindow)
    setAppMode('browse')
    return browse.navigateActive(String(raw || ''))
  })
  ipcMain.handle('browser:back', () => browse.back())
  ipcMain.handle('browser:forward', () => browse.forward())
  ipcMain.handle('browser:reload', () => browse.reload())
  ipcMain.handle('browser:state', () => browse.activeState())
  ipcMain.handle('browser:tabs', () => browse.list())
  ipcMain.handle('browser:new-tab', (_e, url?: string) => {
    if (!mainWindow) return null
    browse.attach(mainWindow)
    setAppMode('browse')
    return browse.addTab(url || 'https://www.twitch.tv/directory')
  })
  ipcMain.handle('browser:activate-tab', (_e, id: string) => {
    browse.activate(id)
    return browse.list()
  })
  ipcMain.handle('browser:close-tab', (_e, id: string) => {
    browse.closeTab(id)
    return browse.list()
  })
  ipcMain.handle('browser:open-pinned', (_e, presetId: string) => {
    if (!mainWindow) return browse.list()
    browse.attach(mainWindow)
    setAppMode('browse')
    browse.openPinned(presetId)
    return browse.list()
  })
  ipcMain.handle('browser:presets', () => PINNED_PRESETS)
  ipcMain.handle('browser:popout-chat', (_e, url?: string) => {
    openChatPopout(url)
  })

  ipcMain.handle('capture:list-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.id.startsWith('screen') ? 'screen' : 'window',
      thumbnailDataUrl: s.thumbnail.toDataURL(),
    }))
  })

  ipcMain.handle('diagnostics:list', () => getDiagnostics())
  ipcMain.handle('diagnostics:clear', () => {
    clearDiagnostics()
    return getDiagnostics()
  })
  ipcMain.handle('diagnostics:export', () => exportDiagnosticsBundle())
  ipcMain.handle('diagnostics:verify', async () => {
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
    const ok = checks.every((c) => c.ok)
    recordDiagnostic(ok ? 'info' : 'warn', 'verify', ok ? 'Verification passed' : 'Verification failed', undefined, {
      checks,
    })
    return { ok, checks, snapshot: snap, diagnostics: getDiagnostics().slice(-20) }
  })

  ipcMain.handle('layout:metrics', () => ({
    mode: appMode,
    top: appMode === 'browse' ? CHROME_BROWSE_TOP : CHROME_STUDIO_TOP,
    left: SIDEBAR_LEFT,
    right: SIDEBAR_RIGHT,
  }))
}

app.whenReady().then(() => {
  installProcessGuards((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('diagnostics:event', event)
    }
  })
  recordDiagnostic('info', 'app.boot', 'Tabcast Browser 0.2 starting')

  allowCapturePermissions()
  neutralizeInstalledRelayConfig()
  registerIpc()
  createAppTray(() => mainWindow)
  relay.subscribe(() => broadcastRelay())
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

app.on('before-quit', () => {
  recordDiagnostic('info', 'app.quit', 'App quitting — stopping relay')
  destroyAppTray()
  void relay.stop()
})
