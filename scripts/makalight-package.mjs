#!/usr/bin/env node
/**
 * Windows-only: wails build + stage relay/node. On Linux, exits 0 after debug (CI uses workflow).
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

if (process.platform !== 'win32') {
  console.log('makalight-package: skipped wails build (not Windows). Use GitHub workflow makalight-release.yml.')
  process.exit(0)
}

function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true })
  if (res.status !== 0) process.exit(res.status ?? 1)
}

run('wails', ['build', '-clean', '-platform', 'windows/amd64'], join(root, 'desktop-wails'))

const binDir = join(root, 'desktop-wails', 'build', 'bin')
if (!existsSync(binDir)) {
  console.error('missing build/bin after wails build')
  process.exit(1)
}

run('node', [join(root, 'scripts', 'makalight-stage.mjs'), binDir], root)
console.log('makalight-package: ok →', binDir)