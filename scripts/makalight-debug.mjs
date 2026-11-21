#!/usr/bin/env node
/**
 * MakaLight debug bundle — run before release / packaging.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const logPath = process.env.MAKALIGHT_DEBUG_LOG || '/opt/cursor/artifacts/makalight-debug.log'

function run(name, cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    ...opts,
  })
  const block = [
    `=== ${name} ===`,
    `cmd: ${cmd} ${args.join(' ')}`,
    `exit: ${res.status}`,
    res.stdout || '',
    res.stderr || '',
  ].join('\n')
  return { ok: res.status === 0, block }
}

const steps = [
  ['test:makalight-sync', 'npm', ['run', 'test:makalight-sync']],
  ['makalight:bundle', 'npm', ['run', 'makalight:bundle']],
  ['verify:makalight-parity', 'npm', ['run', 'verify:makalight-parity']],
  ['go-test', 'go', ['test', './...', '-count=1'], { cwd: join(root, 'desktop-wails') }],
  ['qos-score', 'npm', ['run', 'test:qos-score']],
  ['platform-viewers', 'npm', ['run', 'test:platform-viewers']],
]

if (process.env.MAKA_RELAY_INTEGRATION === '1') {
  steps.push([
    'relay-integration',
    'go',
    ['test', './internal/relay/...', '-run', 'Integration', '-count=1', '-v'],
    { cwd: join(root, 'desktop-wails'), env: { ...process.env, MAKA_RELAY_INTEGRATION: '1' } },
  ])
}

const lines = [`MakaLight debug ${new Date().toISOString()}`, '']
let failed = false
for (const [name, cmd, args, opts] of steps) {
  const { ok, block } = run(name, cmd, args, opts)
  lines.push(block, '')
  if (!ok) failed = true
}

try {
  mkdirSync(dirname(logPath), { recursive: true })
  writeFileSync(logPath, lines.join('\n'), 'utf8')
} catch {
  /* optional log dir */
}

if (failed) {
  console.error('makalight-debug: FAILED (see log)')
  process.exit(1)
}
console.log('makalight-debug: ok')
console.log(`log: ${logPath}`)