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
 * Insert relay/node bundle after the first `File "…exe"` line (idempotent).
 * @param {string} nsi
 * @returns {{ nsi: string, patched: boolean }}
 */
export function patchProjectNsi(nsi) {
  if (nsi.includes(MARKER)) {
    assertBundleBlock(nsi)
    return { nsi, patched: false }
  }
  const block = bundleBlock()
  const fileLine = /(\r?\n)(\ {2,}File\s+"[^"]+\.exe"\s*\r?\n)/m
  if (!fileLine.test(nsi)) {
    throw new Error('could not patch project.nsi — no File *.exe line (run wails build first)')
  }
  const next = nsi.replace(fileLine, `$1$2${block}`)
  assertBundleBlock(next)
  return { nsi: next, patched: true }
}