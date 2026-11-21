/**
 * Pure NSIS project.nsi patch helpers (unit-tested on all platforms).
 */
export const MARKER = '; MAKALIGHT_RELAY_BUNDLE'

export const BUNDLE_FILE_LINES = [
  'File /r "..\\..\\bin\\relay"',
  'File /r "..\\..\\bin\\node"',
  'File "..\\..\\bin\\makalight-bundle.json"',
]

function bundleBlock() {
  const lines = BUNDLE_FILE_LINES.map((l) => `  ${l}`).join('\n')
  return `  ${MARKER}\n${lines}\n`
}

/** @param {string} nsi */
export function assertBundleBlock(nsi) {
  if (!nsi.includes(MARKER)) {
    throw new Error('NSIS bundle marker missing — installer would omit relay/')
  }
  for (const line of BUNDLE_FILE_LINES) {
    if (!nsi.includes(line)) {
      throw new Error(`NSIS bundle incomplete: missing “${line}”`)
    }
  }
}

/**
 * Insert relay/node bundle after Wails ships the app (idempotent).
 * @param {string} nsi
 * @returns {{ nsi: string, patched: boolean }}
 */
export function patchProjectNsi(nsi) {
  if (nsi.includes(MARKER)) {
    assertBundleBlock(nsi)
    return { nsi, patched: false }
  }
  const block = bundleBlock()
  const anchors = [
    /(\r?\n)(\ {2,}!insertmacro wails\.files\s*\r?\n)/m,
    /(\r?\n)(\ {2,}File\s+"[^"]+\.exe"\s*\r?\n)/m,
  ]
  for (const anchor of anchors) {
    if (!anchor.test(nsi)) continue
    const next = nsi.replace(anchor, `$1$2${block}`)
    assertBundleBlock(next)
    return { nsi: next, patched: true }
  }
  throw new Error(
    'could not patch project.nsi — no wails.files or File *.exe anchor (run wails build -nsis first)',
  )
}