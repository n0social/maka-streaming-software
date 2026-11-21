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

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const binDir = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(root, 'desktop-wails', 'build', 'bin')
const installerDir = join(root, 'desktop-wails', 'build', 'windows', 'installer')
const projectNsi = join(installerDir, 'project.nsi')

const MARKER = '; MAKALIGHT_RELAY_BUNDLE'

function main() {
  if (process.platform !== 'win32') {
    console.log('makalight-nsis: skipped (not Windows)')
    process.exit(0)
  }
  if (!existsSync(projectNsi)) {
    console.error('missing', projectNsi, '— run wails build first')
    process.exit(1)
  }
  const relay = join(binDir, 'relay', 'src', 'index.mjs')
  const nodeExe = join(binDir, 'node', 'node.exe')
  if (!existsSync(relay)) {
    console.error('relay not staged — run: node scripts/makalight-stage.mjs', relative(root, binDir))
    process.exit(1)
  }
  if (!existsSync(nodeExe)) {
    console.warn('makalight-nsis: warning — node.exe not found; installer may fail on PCs without Node in PATH')
  }

  let nsi = readFileSync(projectNsi, 'utf8')
  if (!nsi.includes(MARKER)) {
    const block = `  ${MARKER}
  File /r "..\\..\\bin\\relay"
  File /r "..\\..\\bin\\node"
  File "..\\..\\bin\\makalight-bundle.json"
`
    const fileLine = /(\r?\n)(\ {2,}File\s+"[^"]+\.exe"\s*\r?\n)/m
    if (!fileLine.test(nsi)) {
      console.error('could not patch project.nsi — no File *.exe line (run wails build first)')
      process.exit(1)
    }
    nsi = nsi.replace(fileLine, `$1$2${block}`)
    writeFileSync(projectNsi, nsi, 'utf8')
    console.log('patched project.nsi with relay + node bundle')
  }

  const exe = join(binDir, 'MakaLight.exe')
  if (!existsSync(exe)) {
    console.error('missing MakaLight.exe in', binDir)
    process.exit(1)
  }

  const relExe = relative(installerDir, exe).replace(/\//g, '\\')
  const res = spawnSync(
    'makensis',
    [`-DARG_WAILS_AMD64_BINARY=${relExe}`, 'project.nsi'],
    { cwd: installerDir, stdio: 'inherit', shell: true },
  )
  if (res.status !== 0) {
    process.exit(res.status ?? 1)
  }
  console.log('makalight-nsis: installer rebuilt →', join(binDir, 'MakaLight-amd64-installer.exe'))
}

main()