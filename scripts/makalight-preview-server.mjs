#!/usr/bin/env node
/**
 * Serves MakaLight frontend/dist for UI screenshots in CI/Linux.
 * Mocks go.main.App with Electron-shaped responses only (no extra UI fields).
 */
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { readFile as readFileAsync } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'desktop-wails', 'frontend', 'dist')
const port = Number(process.env.MAKALIGHT_PREVIEW_PORT || 8765)

const appVersion = (() => {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  } catch {
    return '0.0.0'
  }
})()

const MOCK_BRIDGE = `
window.go = { main: { App: {
  GetVersionInfo: () => ({ appVersion: ${JSON.stringify(appVersion)}, relayVersion: null, platform: 'linux' }),
  GetRelay: () => ({ lifecycle: 'stopped', health: null, status: null, error: null, pid: null }),
  GetSettings: () => ({
    bitrateProfile: '720p30', adaptiveEncode: true, startupMode: 'studio',
    onboardingComplete: false, setupWizardComplete: false,
    streamDestinations: { twitch: { enabled: false, key: '' }, youtube: { enabled: false, key: '' }, custom: { enabled: false, url: '', key: '' } },
  }),
  GetMode: () => 'studio',
  GetWorkspaceMode: () => 'studio',
  ListCaptureSources: () => [],
  BrowserTabs: () => [],
  BrowserState: () => ({ url: '', title: '', canGoBack: false, canGoForward: false }),
}}};
window.runtime = { EventsOn: () => () => {} };
`

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
}

const server = createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0]
  const path = url === '/' ? '/app.html' : url
  const file = join(dist, path)
  if (!file.startsWith(dist) || !existsSync(file)) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  let body = await readFileAsync(file)
  if (path.endsWith('app.html')) {
    let html = body.toString('utf8')
    if (!html.includes(MOCK_BRIDGE)) {
      html = html.replace(
        '<script src="./maka-bridge.js"></script>',
        `<script>${MOCK_BRIDGE}</script>\n    <script src="./maka-bridge.js"></script>`,
      )
    }
    body = Buffer.from(html, 'utf8')
  }
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
  res.end(body)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`MakaLight preview http://127.0.0.1:${port}/`)
})