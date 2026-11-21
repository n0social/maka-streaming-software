#!/usr/bin/env node
/**
 * MakaLight debug bundle — run before release / packaging.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const logPath =
  process.env.MAKALIGHT_DEBUG_LOG ||
  join(process.env.RUNNER_TEMP || tmpdir(), 'makalight-debug.log')

function run(name, cmd, args, opts = {}) {
  // npm needs cmd.exe on Windows; go test breaks with shell: true (spawn ENOENT / exit 1).
  const useShell = opts.shell ?? (process.platform === 'win32' && cmd === 'npm')
  const res = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: useShell,
    ...opts,
  })
  const block = [
    `=== ${name} ===`,
    `cmd: ${cmd} ${args.join(' ')}`,
    `exit: ${res.status}`,
    res.stdout || '',
    res.stderr || '',
  ].join('\n')
  return { ok: res.status === 0, block, name }
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
let failedStep = ''
let failedBlock = ''
for (const [name, cmd, args, opts] of steps) {
  const { ok, block, name: stepName } = run(name, cmd, args, opts)
  lines.push(block, '')
  if (!ok) {
    failed = true
    if (!failedStep) {
      failedStep = stepName
      failedBlock = block
    }
  }
}

try {
  mkdirSync(dirname(logPath), { recursive: true })
  writeFileSync(logPath, lines.join('\n'), 'utf8')
} catch {
  /* optional log dir */
}

if (failed) {
  console.error(`makalight-debug: FAILED at step "${failedStep}" (see log)`)
  console.error(`log: ${logPath}`)
  const failBlock = lines.find((l) => l.startsWith(`=== ${failedStep} ===`))
  if (failBlock) {
    const start = lines.indexOf(failBlock)
    let end = start + 1
    while (end < lines.length && lines[end] !== '') end++
    console.error(lines.slice(start, end).join('\n'))
  }
  process.exit(1)
}
console.log('makalight-debug: ok')
console.log(`log: ${logPath}`)