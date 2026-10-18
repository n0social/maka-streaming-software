import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recordDiagnostic } from './diagnostics'

let tray: Tray | null = null
let getMain: () => BrowserWindow | null = () => null
let getIsLive: () => boolean = () => false

function iconsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'icons')
  }
  const fromApp = join(app.getAppPath(), 'resources', 'icons')
  if (existsSync(fromApp)) return fromApp
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', '..', 'resources', 'icons')
}

function trayIcon() {
  const dir = iconsDir()
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

function buildTrayMenu(): Menu {
  const live = getIsLive()
  const items: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Show Maka',
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
  ]

  if (live) {
    items.push({
      label: 'Stop & Quit',
      click: () => {
        recordDiagnostic('info', 'tray.quit', 'Stop & Quit from tray while live')
        app.quit()
      },
    })
  } else {
    items.push({
      label: 'Quit',
      click: () => app.quit(),
    })
  }

  return Menu.buildFromTemplate(items)
}

export function rebuildTrayMenu(): void {
  tray?.setContextMenu(buildTrayMenu())
}

export function createAppTray(options: {
  getMain: () => BrowserWindow | null
  getIsLive: () => boolean
}): Tray {
  getMain = options.getMain
  getIsLive = options.getIsLive

  if (tray) {
    rebuildTrayMenu()
    return tray
  }

  const icon = trayIcon()
  tray = new Tray(icon)
  tray.setToolTip('Maka')
  if (!icon.isEmpty()) {
    tray.setImage(icon)
  }

  rebuildTrayMenu()

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
