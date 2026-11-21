#!/usr/bin/env node
/**
 * Stage relay (+ optional Node) beside MakaLight.exe for Windows packaging.
 * Usage: node scripts/makalight-stage.mjs [path-to-build-bin]
 */
import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const binDir =
  process.argv[2] ||
  join(root, 'desktop-wails', 'build', 'bin')

if (!existsSync(binDir)) {
  mkdirSync(binDir, { recursive: true })
}

const relaySrc = join(root, 'relay')
const relayDest = join(binDir, 'relay')
if (!existsSync(join(relaySrc, 'src', 'index.mjs'))) {
  console.error('relay missing — run npm run prepare:relay')
  process.exit(1)
}

rmSync(relayDest, { recursive: true, force: true })
cpSync(relaySrc, relayDest, {
  recursive: true,
  dereference: true,
  filter: (src) => {
    if (/[\\/]node_modules[\\/]\.cache([\\/]|$)/.test(src)) return false
    // Windows npm can junction the monorepo root here — breaks NSIS File /r.
    if (/[\\/]node_modules[\\/]maka([\\/]|$)/.test(src)) return false
    return true
  },
})

const nodeStage = process.env.MAKA_NODE_STAGE
if (nodeStage) {
  if (!existsSync(nodeStage)) {
    console.error('MAKA_NODE_STAGE missing file:', nodeStage)
    process.exit(1)
  }
  const nodeDest = join(binDir, 'node')
  mkdirSync(nodeDest, { recursive: true })
  cpSync(nodeStage, join(nodeDest, 'node.exe'))
  console.log('staged node.exe')
} else if (process.env.CI) {
  console.error('CI build requires MAKA_NODE_STAGE (portable node.exe for relay)')
  process.exit(1)
}

const version = JSON.parse(readFileSync(join(root, 'desktop-wails', 'wails.json'), 'utf8')).info
  .productVersion
writeStageManifest(binDir, version)

console.log(`staged relay → ${relayDest}`)

function writeStageManifest(dir, productVersion) {
  const manifest = {
    product: 'MakaLight',
    version: productVersion,
    relay: '0.1.1',
    layout: ['MakaLight.exe', 'relay/', 'node/node.exe (optional)'],
  }
  const path = join(dir, 'makalight-bundle.json')
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}