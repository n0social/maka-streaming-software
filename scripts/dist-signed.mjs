#!/usr/bin/env node
/**
 * Production signed release pipeline.
 * 1. Sign relay (vendor) before packaging
 * 2. typecheck + build + verify + electron-builder (signs app when CSC_* set)
 * 3. Verify signatures on outputs
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { collectDistArtifacts, hasSigningCert } from './sign-windows.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const signingRequired =
  process.env.MAKA_SIGNING_REQUIRED === '1' || process.env.TABCAST_SIGNING_REQUIRED === '1'

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: root,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const certOk = hasSigningCert()
if (signingRequired && !certOk) {
  console.error('MAKA_SIGNING_REQUIRED=1 but CSC_LINK is not set. See docs/CODE-SIGNING.md')
  process.exit(1)
}

if (!certOk) {
  console.warn('No CSC_LINK — building unsigned. Set cert env vars for Authenticode signing.')
  run('npm', ['run', 'typecheck'])
  run('npm', ['run', 'build'])
  run('node', ['scripts/verify.mjs', '--offline'])
  const publishArgs =
    process.env.GH_TOKEN || process.env.MAKA_PUBLISH === '1' || process.env.TABCAST_PUBLISH === '1'
      ? ['--publish', 'always']
      : []
  run('npx', ['electron-builder', '--win', 'nsis', ...publishArgs])
  process.exit(0)
}

const relayPath = ['MAKArelay.exe', 'TabcastRelay.exe']
  .map((name) => join(root, 'vendor', 'relay', name))
  .find((path) => existsSync(path))
if (relayPath) {
  console.log('Signing relay before packaging…')
  run('node', ['scripts/sign-windows.mjs', relayPath])
} else {
  console.warn('vendor/relay/MAKArelay.exe missing — run npm run fetch:relay first')
}

console.log('Building signed installer (electron-builder uses CSC_* )…')
run('npm', ['run', 'typecheck'])
run('npm', ['run', 'build'])
run('node', ['scripts/verify.mjs', '--offline'])
run('npx', ['electron-builder', '--win', 'nsis', '--publish', 'always'])

const artifacts = collectDistArtifacts()
if (artifacts.length && process.platform === 'win32') {
  console.log('Verifying release signatures…')
  run('node', ['scripts/sign-windows.mjs', '--verify', ...artifacts])
}

console.log('Signed release build complete → dist-installer/')
