#!/usr/bin/env node
/**
 * Serves MakaLight frontend/dist for UI screenshots in CI/Linux (no WebView2).
 * Injects mock window.go / runtime so the studio shell can render.
 */
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile as readFileAsync } from 'node:fs/promises'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'desktop-wails', 'frontend', 'dist')
const port = Number(process.env.MAKALIGHT_PREVIEW_PORT || 8765)

const MOCK_BRIDGE = `
window.go = { main: { App: {
  GetVersionInfo: () => ({ version: '0.1.0', product: 'MakaLight', shell: 'preview', relayTarget: 'open' }),
  GetRelay: () => ({ lifecycle: 'stopped', health: null, status: null, error: null, pid: null }),
  GetSettings: () => ({
    bitrateProfile: '720p30', startupMode: 'studio', onboardingComplete: true, setupWizardComplete: true,
    streamDestinations: { twitch: { enabled: false, key: '' }, youtube: { enabled: false, key: '' }, custom: { enabled: false, url: '', key: '' } },
  }),
  GetMode: () => 'studio',
  GetWorkspaceMode: () => 'studio',
  ListCaptureSources: () => [],
}}};
window.runtime = { EventsOn: () => () => {}, WindowMinimise: () => {}, BrowserOpenURL: () => {} };
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
  const file = join(root, path)
  if (!file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  let body = await readFileAsync(file)
  if (path.endsWith('app.html')) {
    let html = body.toString('utf8')
    html = html.replace(
      '<script src="./maka-bridge.js"></script>',
      `<script>${MOCK_BRIDGE}</script>\n    <script src="./maka-bridge.js"></script>`,
    )
    body = Buffer.from(html, 'utf8')
  }
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
  res.end(body)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`MakaLight preview http://127.0.0.1:${port}/`)
})