#!/usr/bin/env node
/**
 * Refresh site/browser-manifest.json from a built installer artifact.
 * Usage: node scripts/update-browser-manifest.mjs [path/to/Setup.exe]
 */
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync } from 'node:fs'
import { statSync } from 'node:fs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'site', 'browser-manifest.json')

function readJsonUtf8(path) {
  const raw = readFileSync(path, 'utf8')
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  return JSON.parse(text)
}

function findLatestSetup() {
  const distDir = join(root, 'dist-installer')
  if (!existsSync(distDir)) return null
  const setups = readdirSync(distDir)
    .filter((n) => n.endsWith('.exe') && n.includes('Setup'))
    .map((n) => join(distDir, n))
  if (!setups.length) return null
  setups.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return setups[0]
}

async function sha256File(path) {
  const hash = createHash('sha256')
  await new Promise((resolve, reject) => {
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  return hash.digest('hex')
}

async function main() {
  const setupPath = process.argv[2] ? join(process.cwd(), process.argv[2]) : findLatestSetup()
  if (!setupPath || !existsSync(setupPath)) {
    console.error('No installer found. Run npm run dist first or pass a path.')
    process.exit(1)
  }

  const pkg = readJsonUtf8(join(root, 'package.json'))
  const version = pkg.version
  const artifact = basename(setupPath)
  const size = statSync(setupPath).size
  const sha256 = await sha256File(setupPath)

  let signed = false
  if (process.platform === 'win32') {
    const { spawnSync } = await import('node:child_process')
    const verify = spawnSync('node', ['scripts/sign-windows.mjs', '--verify', setupPath], {
      cwd: root,
      encoding: 'utf8',
      shell: true,
    })
    signed = verify.status === 0
  }

  const prev = existsSync(manifestPath) ? readJsonUtf8(manifestPath) : {}

  const manifest = {
    ...prev,
    arch: 'x64',
    platform: 'win32',
    version,
    productName: 'Maka',
    artifact,
    downloadPath: `/downloads/${artifact}`,
    includesRelay: true,
    size,
    sha256,
    signed,
    signing: signed
      ? {
          algorithm: 'sha256',
          timestampServer:
            process.env.MAKA_TIMESTAMP_URL ||
            process.env.TABCAST_TIMESTAMP_URL ||
            'http://timestamp.digicert.com',
        }
      : prev.signing ?? null,
    releasedAt: new Date().toISOString(),
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`Updated ${manifestPath}`)
  console.log(`  ${artifact} · ${size} bytes · signed=${signed}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
