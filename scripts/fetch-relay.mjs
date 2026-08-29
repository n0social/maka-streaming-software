import { createWriteStream, existsSync, mkdirSync, unlinkSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const MANIFEST_URL = 'https://tabcast.live.skydav.work/downloads/relay-manifest.json'
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'relay')
const OUT_FILE = join(OUT_DIR, 'TabcastRelay.exe')

async function sha256File(path) {
  const { createReadStream } = await import('node:fs')
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
  mkdirSync(OUT_DIR, { recursive: true })

  console.log('Fetching relay manifest…')
  const manifest = await (await fetch(MANIFEST_URL)).json()
  const artifactUrl = `https://tabcast.live.skydav.work/downloads/${manifest.artifact}`
  const expectedSha = String(manifest.sha256 || '').toLowerCase()
  const expectedSize = Number(manifest.size || 0)
  const force = process.argv.includes('--force')

  if (existsSync(OUT_FILE) && !force) {
    const size = statSync(OUT_FILE).size
    if (expectedSize && size === expectedSize && expectedSha) {
      const digest = await sha256File(OUT_FILE)
      if (digest === expectedSha) {
        console.log(`Relay already present and verified at ${OUT_FILE}`)
        console.log(`Manifest version ${manifest.version} (${manifest.size} bytes).`)
        writeFileSync(
          join(OUT_DIR, 'relay-manifest.json'),
          `${JSON.stringify(manifest, null, 2)}\n`,
          'utf8',
        )
        return
      }
      console.warn('SHA mismatch — re-downloading…')
    } else if (expectedSize && size !== expectedSize) {
      console.warn(
        `Incomplete binary (${size} / ${expectedSize} bytes) — re-downloading…`,
      )
    } else {
      console.log(`Relay present at ${OUT_FILE} (${size} bytes). Use --force to re-download.`)
      return
    }
  }

  if (existsSync(OUT_FILE)) {
    unlinkSync(OUT_FILE)
  }

  console.log(`Downloading ${artifactUrl}`)
  console.log(`→ ${OUT_FILE}`)
  const res = await fetch(artifactUrl)
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`)
  }

  const hash = createHash('sha256')
  const file = createWriteStream(OUT_FILE)
  const nodeStream = Readable.fromWeb(res.body)
  let received = 0
  let lastLog = 0

  nodeStream.on('data', (chunk) => {
    hash.update(chunk)
    received += chunk.length
    if (received - lastLog > 8 * 1024 * 1024) {
      lastLog = received
      const pct = expectedSize ? ` (${Math.round((100 * received) / expectedSize)}%)` : ''
      console.log(`… ${(received / (1024 * 1024)).toFixed(1)} MB${pct}`)
    }
  })

  await pipeline(nodeStream, file)

  const digest = hash.digest('hex')
  if (expectedSha && digest !== expectedSha) {
    unlinkSync(OUT_FILE)
    throw new Error(`SHA-256 mismatch.\nExpected ${expectedSha}\nGot      ${digest}`)
  }

  console.log(`OK — TabcastRelay.exe ready (sha256 ${digest.slice(0, 12)}…)`)
  console.log(`Port ${manifest.port} · stream ${manifest.streamUrl}`)

  writeFileSync(
    join(OUT_DIR, 'relay-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  console.log(`Wrote ${join(OUT_DIR, 'relay-manifest.json')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
