#!/usr/bin/env node
/**
 * Offline verification for Maka and the open MAKA.relay source.
 * Usage: node scripts/verify.mjs [--offline]
 *
 * --offline  Skip live relay HTTP checks (build + relay source only).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const offline = process.argv.includes('--offline')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const relayEntry = join(root, 'relay', 'src', 'index.mjs')
const relayVersion = join(root, 'relay', 'VERSION')

const checks = []

function check(name, ok, detail) {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} — ${detail}`)
}

const version = existsSync(relayVersion)
  ? readFileSync(relayVersion, 'utf8').trim()
  : '?'

check('build-main', existsSync(join(root, 'out/main/index.js')), 'out/main/index.js')
check('build-ui', existsSync(join(root, 'out/renderer/app.html')), 'out/renderer/app.html')
check('relay-src', existsSync(relayEntry), `relay/src/index.mjs · v${version}`)

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