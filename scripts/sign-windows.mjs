#!/usr/bin/env node
/**
 * Windows Authenticode signing helper for Maka + TabcastRelay.
 *
 * Usage:
 *   node scripts/sign-windows.mjs <file.exe> [file2.exe ...]
 *   node scripts/sign-windows.mjs --verify <file.exe>
 *   node scripts/sign-windows.mjs --all   # sign common dist-installer outputs
 *
 * Env:
 *   CSC_LINK / WIN_CSC_LINK     Path to .pfx or base64 pfx
 *   CSC_KEY_PASSWORD / WIN_CSC_KEY_PASSWORD
 *   TABCAST_TIMESTAMP_URL       Default http://timestamp.digicert.com
 */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const timestampUrl = process.env.TABCAST_TIMESTAMP_URL || 'http://timestamp.digicert.com'

function findSigntool() {
  if (process.platform !== 'win32') return null
  try {
    const out = execFileSync('where.exe', ['signtool'], { encoding: 'utf8' }).trim()
    const first = out.split(/\r?\n/).find(Boolean)
    if (first && existsSync(first)) return first
  } catch {
    /* continue */
  }
  const kitsRoot = join(
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    'Windows Kits',
    '10',
    'bin',
  )
  if (!existsSync(kitsRoot)) return null
  const versions = readdirSync(kitsRoot)
    .filter((d) => /^\d/.test(d))
    .sort()
    .reverse()
  for (const ver of versions) {
    const candidate = join(kitsRoot, ver, 'x64', 'signtool.exe')
    if (existsSync(candidate)) return candidate
  }
  return null
}

function readCertConfig() {
  const link = process.env.WIN_CSC_LINK || process.env.CSC_LINK || ''
  const password = process.env.WIN_CSC_KEY_PASSWORD || process.env.CSC_KEY_PASSWORD || ''
  if (!link) return null

  let pfxPath = link
  let tempDir = null

  if (!existsSync(link)) {
    try {
      tempDir = mkdtempSync(join(tmpdir(), 'tabcast-pfx-'))
      pfxPath = join(tempDir, 'cert.pfx')
      writeFileSync(pfxPath, Buffer.from(link, 'base64'))
    } catch {
      return null
    }
  }

  return { pfxPath, password, tempDir }
}

function cleanupCert(cfg) {
  if (!cfg?.tempDir) return
  try {
    rmSync(cfg.tempDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

export function hasSigningCert() {
  return Boolean(readCertConfig())
}

export function collectDistArtifacts() {
  const out = []
  const distDir = join(root, 'dist-installer')
  for (const name of ['MAKArelay.exe', 'TabcastRelay.exe']) {
    const relayVendor = join(root, 'vendor', 'relay', name)
    if (existsSync(relayVendor)) out.push(relayVendor)
  }

  const unpacked = join(distDir, 'win-unpacked', 'Maka.exe')
  if (existsSync(unpacked)) out.push(unpacked)

  for (const name of ['MAKArelay.exe', 'TabcastRelay.exe']) {
    const relayBundled = join(distDir, 'win-unpacked', 'resources', 'relay', name)
    if (existsSync(relayBundled)) out.push(relayBundled)
  }

  if (existsSync(distDir)) {
    for (const name of readdirSync(distDir)) {
      if (name.endsWith('.exe') && name.includes('Setup')) {
        out.push(join(distDir, name))
      }
    }
  }

  return [...new Set(out)]
}

export function signFile(signtool, cfg, filePath) {
  const abs = resolve(filePath)
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`)
  }
  const args = [
    'sign',
    '/fd',
    'sha256',
    '/tr',
    timestampUrl,
    '/td',
    'sha256',
    '/f',
    cfg.pfxPath,
    '/d',
    'Maka',
    abs,
  ]
  if (cfg.password) {
    args.splice(args.length - 1, 0, '/p', cfg.password)
  }

  const result = spawnSync(signtool, args, { encoding: 'utf8', windowsHide: true })
  if (result.status !== 0) {
    throw new Error(`signtool sign failed for ${abs}\n${result.stdout}\n${result.stderr}`.trim())
  }
  console.log(`Signed: ${abs}`)
}

export function verifyFile(signtool, filePath) {
  const abs = resolve(filePath)
  if (!existsSync(abs)) {
    throw new Error(`File not found: ${abs}`)
  }
  const result = spawnSync(signtool, ['verify', '/pa', abs], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`Not signed or invalid: ${abs}\n${result.stdout}\n${result.stderr}`.trim())
  }
  console.log(`Verified: ${abs}`)
}

function main() {
  const args = process.argv.slice(2)
  const verifyMode = args[0] === '--verify'
  const allMode = args[0] === '--all'
  const files = verifyMode || allMode ? args.slice(1) : args

  const signtool = findSigntool()
  if (!signtool) {
    console.error('signtool.exe not found. Install Windows SDK Signing Tools.')
    process.exit(process.platform === 'win32' ? 1 : 0)
  }

  const targets =
    allMode && files.length === 0 ? collectDistArtifacts() : files.map((f) => resolve(f))
  if (!targets.length) {
    console.error('No files to process. Pass paths or use --all after dist.')
    process.exit(1)
  }

  if (verifyMode) {
    let failed = 0
    for (const file of targets) {
      try {
        verifyFile(signtool, file)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        failed += 1
      }
    }
    process.exit(failed ? 1 : 0)
  }

  const cfg = readCertConfig()
  if (!cfg) {
    console.error(
      'No signing certificate. Set CSC_LINK (+ CSC_KEY_PASSWORD) to a .pfx path or base64.',
    )
    process.exit(1)
  }

  try {
    for (const file of targets) {
      signFile(signtool, cfg, file)
      verifyFile(signtool, file)
    }
  } finally {
    cleanupCert(cfg)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
