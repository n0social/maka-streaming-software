#!/usr/bin/env node
/**
 * Offline verification for Tabcast Browser + local relay.
 * Usage: node scripts/verify.mjs
 */
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const exe = join(root, 'vendor', 'relay', 'TabcastRelay.exe')
const expected = 394_267_438

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

const failed = checks.filter((c) => !c.ok)
console.log('')
if (failed.length) {
  console.error(`Verification FAILED (${failed.length})`)
  process.exit(1)
}
console.log('Verification PASSED')
