#!/usr/bin/env node
/**
 * Offline verification for Tabcast Browser + local relay.
 * Usage: node scripts/verify.mjs [--offline]
 *
 * --offline  Skip live relay HTTP checks (build + binary only).
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const offline = process.argv.includes('--offline')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const exe =
  ['MAKArelay.exe', 'TabcastRelay.exe']
    .map((name) => join(root, 'vendor', 'relay', name))
    .find((path) => existsSync(path)) ?? join(root, 'vendor', 'relay', 'MAKArelay.exe')
const manifestPath = join(root, 'vendor', 'relay', 'relay-manifest.json')

function readExpectedSize() {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    return Number(manifest.size || 0) || 394_267_438
  } catch {
    return 394_267_438
  }
}

const expected = readExpectedSize()

const checks = []

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} — ${detail}`)
}

check('build-main', existsSync(join(root, 'out/main/index.js')), 'out/main/index.js')
check('build-ui', existsSync(join(root, 'out/renderer/app.html')), 'out/renderer/app.html')
check(
  'relay-binary',
  existsSync(exe) && statSync(exe).size === expected,
  existsSync(exe) ? `${statSync(exe).size} bytes` : 'missing',
)

if (offline) {
  check('relay-health', true, 'skipped (--offline)')
  check('relay-status', true, 'skipped (--offline)')
} else {
  try {
    const health = await fetch('http://127.0.0.1:38473/health', {
      signal: AbortSignal.timeout(4000),
    })
    const body = await health.json()
    check('relay-health', health.ok && body?.ok === true, `v${body?.version ?? '?'}`)
  } catch (err) {
    check('relay-health', false, err instanceof Error ? err.message : String(err))
  }

  try {
    const status = await fetch('http://127.0.0.1:38473/status', {
      signal: AbortSignal.timeout(4000),
    })
    const body = await status.json()
    check('relay-status', status.ok, body?.status ?? JSON.stringify(body))
  } catch (err) {
    check('relay-status', false, err instanceof Error ? err.message : String(err))
  }
}

const failed = checks.filter((c) => !c.ok)
console.log('')
if (failed.length) {
  console.error(`Verification FAILED (${failed.length})`)
  process.exit(1)
}
console.log('Verification PASSED')
