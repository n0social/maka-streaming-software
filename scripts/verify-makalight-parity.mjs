#!/usr/bin/env node
/**
 * Ensures desktop-wails/frontend/dist matches out/renderer except:
 * - app.html: optional maka-bridge.js script tag
 * - maka-bridge.js present in dist
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'out', 'renderer')
const dist = join(root, 'desktop-wails', 'frontend', 'dist')

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function walk(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files.push(...walk(p))
    else files.push(p)
  }
  return files
}

function stripBridgeInjection(html) {
  return html
    .replace(/\s*<script src="\.\/maka-bridge\.js"><\/script>\n?/g, '')
}

function main() {
  if (!existsSync(src) || !existsSync(dist)) {
    console.error('Run: npm run makalight:bundle')
    process.exit(1)
  }

  const srcFiles = new Set(walk(src).map((p) => relative(src, p)))
  const distFiles = new Set(walk(dist).map((p) => relative(dist, p)))

  const extra = [...distFiles].filter((f) => f !== 'maka-bridge.js' && !srcFiles.has(f))
  const missing = [...srcFiles].filter((f) => !distFiles.has(f))

  if (extra.length || missing.length) {
    console.error('File set mismatch', { extra, missing })
    process.exit(1)
  }

  let ok = true
  for (const rel of srcFiles) {
    if (rel === 'app.html') {
      const a = stripBridgeInjection(readFileSync(join(src, rel), 'utf8'))
      const b = stripBridgeInjection(readFileSync(join(dist, rel), 'utf8'))
      if (a !== b) {
        console.error('app.html differs beyond bridge injection')
        ok = false
      }
      continue
    }
    if (hashFile(join(src, rel)) !== hashFile(join(dist, rel))) {
      console.error('Hash mismatch:', rel)
      ok = false
    }
  }

  if (!existsSync(join(dist, 'maka-bridge.js'))) {
    console.error('Missing dist/maka-bridge.js')
    ok = false
  }

  if (!ok) process.exit(1)
  console.log('makalight parity: ok (1:1 renderer + bridge)')
}

main()