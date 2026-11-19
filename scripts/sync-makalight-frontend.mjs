#!/usr/bin/env node
/**
 * Copy electron-vite renderer build into MakaLight and strip in-app browser fluff from the bundle only.
 * Does not modify src/renderer/ (Electron stays frozen).
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'out', 'renderer')
const destDir = join(root, 'desktop-wails', 'frontend', 'dist')
const bridgeSrc = join(root, 'desktop-wails', 'frontend', 'maka-bridge.js')

const REMOVE_IDS = [
  'studio-source-browser',
  'source-picker-browser',
  'program-browser',
  'layer-browser',
  'btn-capture-browse',
]

const REMOVE_SELECTORS = [
  /<webview[\s\S]*?<\/webview>/gi,
  /<webview[^>]*\/>/gi,
]

function patchAppHtml(html) {
  let out = html
  out = out.replace(/\sdata-mode="studio"/, ' data-mode="studio" data-makalight="1"')
  for (const id of REMOVE_IDS) {
    const re = new RegExp(`<[^>]+\\bid="${id}"[\\s\\S]*?>([\\s\\S]*?<\\/[^>]+>)?`, 'gi')
    out = out.replace(re, '')
    const re2 = new RegExp(`<[^>]+\\bid="${id}"[^>]*/>`, 'gi')
    out = out.replace(re2, '')
  }
  for (const re of REMOVE_SELECTORS) {
    out = out.replace(re, '')
  }
  if (!out.includes('maka-bridge.js')) {
    out = out.replace(
      /<script type="module" src="\.\/app\.js"><\/script>/,
      '<script src="./maka-bridge.js"></script>\n    <script type="module" src="./app.js"></script>',
    )
    if (!out.includes('maka-bridge.js')) {
      out = out.replace(
        /<script type="module" src="\.\/app\.ts"><\/script>/,
        '<script src="./maka-bridge.js"></script>\n    <script type="module" src="./app.js"></script>',
      )
    }
  }
  return out
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
    const html = readFileSync(appHtml, 'utf8')
    writeFileSync(appHtml, patchAppHtml(html))
  }

  copyFileSync(bridgeSrc, join(destDir, 'maka-bridge.js'))
  console.log(`MakaLight frontend synced → ${destDir}`)
}

main()