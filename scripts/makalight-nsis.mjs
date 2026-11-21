#!/usr/bin/env node
/**
 * Rebuild the NSIS installer after relay/ and node/ are staged in build/bin.
 * Wails runs makensis before makalight-stage, so the default installer omits the relay bundle.
 *
 * Prerequisite: `wails build` on Windows (generates build/windows/installer/project.nsi + wails_tools.nsh).
 * Usage: node scripts/makalight-nsis.mjs [path-to-build-bin]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { assertBundleBlock, patchProjectNsi } from './makalight-nsis-patch.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const binDir = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(root, 'desktop-wails', 'build', 'bin')
const installerDir = join(root, 'desktop-wails', 'build', 'windows', 'installer')
const projectNsi = join(installerDir, 'project.nsi')

function fail(msg) {
  console.error('makalight-nsis: ERROR:', msg)
  process.exit(1)
}

function main() {
  if (process.platform !== 'win32') {
    console.log('makalight-nsis: skipped (not Windows)')
    process.exit(0)
  }
  if (!existsSync(projectNsi)) {
    fail(`missing ${projectNsi} — run wails build first`)
  }
  const relay = join(binDir, 'relay', 'src', 'index.mjs')
  const nodeExe = join(binDir, 'node', 'node.exe')
  if (!existsSync(relay)) {
    fail(`relay not staged — run: node scripts/makalight-stage.mjs ${relative(root, binDir)}`)
  }
  if (!existsSync(nodeExe)) {
    if (process.env.CI) {
      fail('node.exe not staged — set MAKA_NODE_STAGE before makalight-stage.mjs (release workflow)')
    }
    console.warn('makalight-nsis: warning — node.exe not found; installer may fail on PCs without Node in PATH')
  }

  let nsi = readFileSync(projectNsi, 'utf8')
  try {
    const { nsi: patched, patched: didPatch } = patchProjectNsi(nsi)
    nsi = patched
    if (didPatch) {
      writeFileSync(projectNsi, nsi, 'utf8')
      console.log('patched project.nsi with relay + node bundle')
    } else {
      assertBundleBlock(nsi)
      console.log('project.nsi already contains relay bundle marker')
    }
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e))
  }

  const exe = join(binDir, 'MakaLight.exe')
  if (!existsSync(exe)) {
    fail(`missing MakaLight.exe in ${binDir}`)
  }

  const relExe = relative(installerDir, exe).replace(/\//g, '\\')
  const res = spawnSync(
    'makensis',
    [`-DARG_WAILS_AMD64_BINARY=${relExe}`, 'project.nsi'],
    { cwd: installerDir, stdio: 'inherit', shell: true },
  )
  if (res.status !== 0) {
    fail(`makensis exited ${res.status ?? 1}`)
  }
  const installer = join(binDir, 'MakaLight-amd64-installer.exe')
  if (!existsSync(installer)) {
    fail(`expected installer at ${installer}`)
  }
  console.log('makalight-nsis: installer rebuilt →', installer)
}

main()