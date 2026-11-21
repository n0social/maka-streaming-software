import { strict as assert } from 'node:assert'
import { MARKER, BUNDLE_FILE_LINES, patchProjectNsi, assertBundleBlock } from './makalight-nsis-patch.mjs'

const sample = `!define NAME "MakaLight"
Section "install"
  File "MakaLight.exe"
SectionEnd
`

const { nsi, patched } = patchProjectNsi(sample)
assert.equal(patched, true)
assert.ok(nsi.includes(MARKER))
for (const line of BUNDLE_FILE_LINES) {
  assert.ok(nsi.includes(line), line)
}

const again = patchProjectNsi(nsi)
assert.equal(again.patched, false)
assert.equal(again.nsi, nsi)

try {
  patchProjectNsi('Section\n  SetOutPath $INSTDIR\n')
  assert.fail('expected patch failure without exe File line')
} catch (e) {
  assert.match(String(e.message), /File \*\.exe/)
}

try {
  assertBundleBlock(`${MARKER}\n  File /r "..\\..\\bin\\relay"\n`)
  assert.fail('expected incomplete bundle failure')
} catch (e) {
  assert.match(String(e.message), /incomplete/)
}

console.log('makalight-nsis.test.mjs: ok')