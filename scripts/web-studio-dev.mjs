#!/usr/bin/env node
/** Static file server for site/ during local web-studio testing. */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'site')
const HOST = process.env.WEB_STUDIO_HOST ?? '127.0.0.1'
const PORT = Number(process.env.WEB_STUDIO_PORT ?? 8765)
const withRelay = process.argv.includes('--with-relay')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const rel = decoded.replace(/^\/+/, '')
  const resolved = normalize(join(root, rel))
  if (!resolved.startsWith(root)) return null
  return resolved
}

async function serveFile(res, filePath) {
  const data = await readFile(filePath)
  const ext = extname(filePath).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' })
  res.end(data)
}

const server = createServer(async (req, res) => {
  try {
    let filePath = safePath(req.url ?? '/')
    if (!filePath) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    let st
    try {
      st = await stat(filePath)
    } catch {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    if (st.isDirectory()) {
      filePath = join(filePath, 'index.html')
      st = await stat(filePath).catch(() => null)
      if (!st) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
    }
    await serveFile(res, filePath)
  } catch (err) {
    console.error(err)
    res.writeHead(500)
    res.end('Error')
  }
})

let relayChild = null
if (withRelay) {
  relayChild = spawn(process.execPath, ['scripts/web-relay-dev.mjs'], {
    cwd: join(dirname(fileURLToPath(import.meta.url)), '..'),
    stdio: 'inherit',
  })
}

server.listen(PORT, HOST, () => {
  console.log(`Maka web studio static server → http://${HOST}:${PORT}/stream/`)
  if (withRelay) console.log('(spawned scripts/web-relay-dev.mjs on :38473)')
  else console.log('Start relay separately: npm run web:relay')
})

function shutdown() {
  relayChild?.kill('SIGINT')
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
