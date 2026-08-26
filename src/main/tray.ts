import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recordDiagnostic } from './diagnostics'

let tray: Tray | null = null

function iconsDir(): string {
  // Packaged: resources/icons next to app.asar
  if (app.isPackaged) {
    return join(process.resourcesPath, 'icons')
  }
  // Dev / preview: resolve from app root (electron-vite) then fall back to source-relative
  const fromApp = join(app.getAppPath(), 'resources', 'icons')
  if (existsSync(fromApp)) return fromApp
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', '..', 'resources', 'icons')
}

function trayIcon() {
  const dir = iconsDir()
  // Prefer PNG on Windows — Electron often loads broken/empty bitmaps from bad ICOs.
  const candidates = [
    join(dir, 'tray.png'),
    join(dir, 'icon-16.png'),
    join(dir, 'icon-32.png'),
    join(dir, 'tray@2x.png'),
    join(dir, 'icon.ico'),
  ]

  for (const path of candidates) {
    if (!existsSync(path)) continue
    let image = nativeImage.createFromPath(path)
    if (image.isEmpty()) {
      recordDiagnostic('warn', 'tray.icon', `Empty nativeImage from ${path}`)
      continue
    }
    // Windows notification area is ~16 CSS px; provide a sharp 16px bitmap
    const size = image.getSize()
    if (size.width !== 16 || size.height !== 16) {
      image = image.resize({ width: 16, height: 16, quality: 'best' })
    }
    if (image.isEmpty()) continue
    recordDiagnostic('info', 'tray.icon', `Using ${path} (${image.getSize().width}x${image.getSize().height})`)
    return image
  }

  recordDiagnostic('warn', 'tray.icon', `Tray icon assets missing under ${dir}`)
  return nativeImage.createEmpty()
}

export function createAppTray(getMain: () => BrowserWindow | null): Tray {
  if (tray) return tray

  const icon = trayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Tabcast Browser')
  if (!icon.isEmpty()) {
    tray.setImage(icon)
  }

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

export function appIconPath(): string | undefined {
  const ico = join(iconsDir(), 'icon.ico')
  const png = join(iconsDir(), 'icon-256.png')
  if (existsSync(ico)) return ico
  if (existsSync(png)) return png
  return undefined
}
