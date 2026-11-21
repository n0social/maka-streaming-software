#!/usr/bin/env node
/**
 * 1:1 port rule: copy electron-vite renderer output verbatim.
 * Only change allowed in app.html: inject maka-bridge.js before the module entry (Wails shell).
 * Does not modify src/renderer/ or Electron.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'out', 'renderer')
const destDir = join(root, 'desktop-wails', 'frontend', 'dist')
const bridgeSrc = join(root, 'desktop-wails', 'frontend', 'maka-bridge.js')

const BRIDGE_TAG = '<script src="./maka-bridge.js"></script>'

function injectBridge(html) {
  if (html.includes('maka-bridge.js')) return html
  const injected = html.replace(
    /(\n)(\s*)(<script type="module"[^>]*src="\.\/assets\/[^"]+"><\/script>)/,
    `$1$2${BRIDGE_TAG}$1$2$3`,
  )
  if (injected !== html) return injected
  const withJs = html.replace(
    /(\s*)<script type="module" src="\.\/app\.js"><\/script>/,
    `$1${BRIDGE_TAG}\n$1<script type="module" src="./app.js"></script>`,
  )
  if (withJs !== html) return withJs
  return html.replace(
    /(\s*)<script type="module" src="\.\/app\.ts"><\/script>/,
    `$1${BRIDGE_TAG}\n$1<script type="module" src="./app.js"></script>`,
  )
}

function main() {
  if (!existsSync(srcDir)) {
    console.error('Missing out/renderer — run: npm run build')
    process.exit(1)
  }
  if (!existsSync(bridgeSrc)) {
    console.error('Missing desktop-wails/frontend/maka-bridge.js')
    process.exit(1)
  }

  rmSync(destDir, { recursive: true, force: true })
  mkdirSync(destDir, { recursive: true })
  cpSync(srcDir, destDir, { recursive: true })

  const appHtml = join(destDir, 'app.html')
  if (existsSync(appHtml)) {
    const html = injectBridge(readFileSync(appHtml, 'utf8'))
    writeFileSync(appHtml, html)
    // Wails asset server requires index.html at the embed root.
    writeFileSync(join(destDir, 'index.html'), html)
  }

  copyFileSync(bridgeSrc, join(destDir, 'maka-bridge.js'))
  console.log(`MakaLight frontend synced (1:1 copy + bridge) → ${destDir}`)
}

main()