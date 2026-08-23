import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron'
import { join } from 'node:path'
import { recordDiagnostic } from './diagnostics'

let tray: Tray | null = null

function trayIcon() {
  // 16x16 amber square PNG (1x) — tiny inline placeholder
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVQ4T2NkYGD4z0ABYBzVMKoBBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGAAC6AAfVq8V0AAAAAElFTkSuQmCC',
    'base64',
  )
  return nativeImage.createFromBuffer(png)
}

export function createAppTray(getMain: () => BrowserWindow | null): Tray {
  if (tray) return tray
  tray = new Tray(trayIcon())
  tray.setToolTip('Tabcast Browser')

  const rebuild = () => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Show Tabcast',
        click: () => {
          const win = getMain()
          if (!win) return
          win.show()
          win.focus()
        },
      },
      {
        label: 'Hide to tray',
        click: () => getMain()?.hide(),
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit()
        },
      },
    ])
    tray?.setContextMenu(menu)
  }

  rebuild()
  tray.on('double-click', () => {
    const win = getMain()
    if (!win) return
    win.show()
    win.focus()
  })

  recordDiagnostic('info', 'tray', 'System tray ready')
  return tray
}

export function destroyAppTray(): void {
  tray?.destroy()
  tray = null
}

export function maybeMinimizeToTray(
  win: BrowserWindow,
  enabled: boolean,
  isLive: boolean,
): boolean {
  if (!enabled || !isLive || !tray) return false
  win.hide()
  recordDiagnostic('info', 'tray.minimize', 'Minimized to tray while live')
  return true
}
