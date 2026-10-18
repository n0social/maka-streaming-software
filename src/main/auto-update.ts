import { BrowserWindow, app } from 'electron'
import electronUpdater from 'electron-updater'

// electron-updater is CommonJS and exposes autoUpdater via a getter.
// Electron 37's ESM loader does not accept that as a named export.
const { autoUpdater } = electronUpdater
import { recordDiagnostic } from './diagnostics'

export type UpdateStatus = {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  progress?: number
  message?: string
}

let getMainWindow: () => BrowserWindow | null = () => null
let lastStatus: UpdateStatus = { state: 'idle' }

function broadcast(status: UpdateStatus): void {
  lastStatus = status
  recordDiagnostic('info', 'app.update', `Update ${status.state}${status.version ? ` v${status.version}` : ''}`, undefined, {
    progress: status.progress,
    message: status.message,
  })
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('app:update-status', status)
  }
}

export function initAutoUpdate(getMain: () => BrowserWindow | null): void {
  getMainWindow = getMain

  if (!app.isPackaged) {
    recordDiagnostic('info', 'app.update', 'Auto-update disabled in dev (unpackaged)')
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    broadcast({ state: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => broadcast({ state: 'not-available' }))
  autoUpdater.on('error', (err) => {
    broadcast({ state: 'error', message: err.message })
  })
  autoUpdater.on('download-progress', (progress) => {
    broadcast({ state: 'downloading', progress: progress.percent })
  })
  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ state: 'downloaded', version: info.version })
  })

  // Non-blocking startup check — give relay/UI time to settle first.
  setTimeout(() => {
    void checkForUpdates().catch((err) => {
      recordDiagnostic('warn', 'app.update', 'Startup update check failed', err)
    })
  }, 12_000)
}

export function getUpdateStatus(): UpdateStatus {
  return lastStatus
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    const status: UpdateStatus = { state: 'not-available', message: 'Dev build' }
    broadcast(status)
    return status
  }

  try {
    broadcast({ state: 'checking' })
    const result = await autoUpdater.checkForUpdates()
    if (result?.updateInfo?.version && result.downloadPromise) {
      return lastStatus
    }
    return lastStatus
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    broadcast({ state: 'error', message })
    return lastStatus
  }
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!app.isPackaged) return lastStatus
  try {
    broadcast({ state: 'downloading', progress: 0 })
    await autoUpdater.downloadUpdate()
    return lastStatus
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    broadcast({ state: 'error', message })
    return lastStatus
  }
}

export function installUpdate(): void {
  if (!app.isPackaged) return
  autoUpdater.quitAndInstall(false, true)
}
