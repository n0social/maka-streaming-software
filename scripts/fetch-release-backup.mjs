#!/usr/bin/env node
/**
 * Download GitHub Release assets listed in releases/backup/<tag>/manifest.json.
 * Large installers stay gitignored; manifests and SHA256SUMS are committed.
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const opts = { tag: 'maka.streaming.v.01', all: false, force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--tag' && argv[i + 1]) {
      opts.tag = argv[++i]
    } else if (a === '--all') {
      opts.all = true
    } else if (a === '--force') {
      opts.force = true
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/fetch-release-backup.mjs [--tag NAME] [--all] [--force]

Downloads release assets into releases/backup/<tag>/ using manifest.json.
Default tag: maka.streaming.v.01`)
      process.exit(0)
    }
  }
  return opts
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

function releaseDownloadUrl(repository, tag, assetName) {
  const base = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}`
  return `${base}/${assetName.split('/').map(encodeURIComponent).join('/')}`
}

async function downloadAsset(url, dest, expectedSize) {
  console.log(`Downloading ${url}`)
  console.log(`→ ${dest}`)
  const headers = {}
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  const res = await fetch(url, { headers, redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status} for ${url}`)
  }

  const hash = createHash('sha256')
  const file = createWriteStream(dest)
  const nodeStream = Readable.fromWeb(res.body)
  let received = 0
  let lastLog = 0

  nodeStream.on('data', (chunk) => {
    hash.update(chunk)
    received += chunk.length
    if (received - lastLog > 8 * 1024 * 1024) {
      lastLog = received
      const mb = (received / (1024 * 1024)).toFixed(1)
      process.stdout.write(`  … ${mb} MiB\r`)
    }
  })

  await pipeline(nodeStream, file)
  const digest = hash.digest('hex')
  const size = statSync(dest).size
  if (expectedSize && size !== expectedSize) {
    unlinkSync(dest)
    throw new Error(`Size mismatch for ${dest}: got ${size}, expected ${expectedSize}`)
  }
  console.log(`  done (${size} bytes, sha256 ${digest})`)
  return digest
}

async function ensureAsset(manifest, asset, outDir, force) {
  const dest = join(outDir, asset.name)
  const expectedSha = String(asset.sha256 || '').toLowerCase()
  const expectedSize = Number(asset.size || 0)

  if (existsSync(dest) && !force) {
    const size = statSync(dest).size
    if (expectedSize && size === expectedSize && expectedSha) {
      const digest = await sha256File(dest)
      if (digest === expectedSha) {
        console.log(`Already present and verified: ${asset.name}`)
        return
      }
      console.warn(`SHA mismatch for ${asset.name} — re-downloading…`)
    } else if (expectedSize && size !== expectedSize) {
      console.warn(`Incomplete ${asset.name} (${size}/${expectedSize}) — re-downloading…`)
    } else {
      console.log(`Present at ${dest}; use --force to re-download.`)
      return
    }
  }

  if (existsSync(dest)) {
    unlinkSync(dest)
  }

  const url = releaseDownloadUrl(manifest.repository, manifest.tag, asset.name)
  const digest = await downloadAsset(url, dest, expectedSize)
  if (expectedSha && digest !== expectedSha) {
    unlinkSync(dest)
    throw new Error(`SHA256 mismatch for ${asset.name}: got ${digest}, expected ${expectedSha}`)
  }
}

async function main() {
  const { tag, all, force } = parseArgs(process.argv.slice(2))
  const outDir = join(root, 'releases', 'backup', tag)
  const manifestPath = join(outDir, 'manifest.json')

  if (!existsSync(manifestPath)) {
    throw new Error(`No manifest at ${manifestPath}. Add releases/backup/${tag}/manifest.json first.`)
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.tag !== tag) {
    console.warn(`Manifest tag ${manifest.tag} differs from --tag ${tag}; using folder ${tag}.`)
  }

  mkdirSync(outDir, { recursive: true })

  const assets = (manifest.assets || []).filter((a) => all || a.required)
  if (assets.length === 0) {
    throw new Error('No assets to download (use --all for optional files).')
  }

  for (const asset of assets) {
    await ensureAsset(manifest, asset, outDir, force)
  }

  console.log(`\nBackup assets ready under ${outDir}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
