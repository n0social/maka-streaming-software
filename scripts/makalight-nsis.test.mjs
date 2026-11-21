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

const wailsStyle = `Section "Install"
  SetOutPath $INSTDIR
  !insertmacro wails.files
SectionEnd
`
const wailsPatch = patchProjectNsi(wailsStyle)
assert.equal(wailsPatch.patched, true)
assert.ok(wailsPatch.nsi.includes(MARKER))

try {
  patchProjectNsi('Section\n  SetOutPath $INSTDIR\n')
  assert.fail('expected patch failure without anchor')
} catch (e) {
  assert.match(String(e.message), /wails\.files/)
}

try {
  assertBundleBlock(`${MARKER}\n  File /r "..\\..\\bin\\relay"\n`)
  assert.fail('expected incomplete bundle failure')
} catch (e) {
  assert.match(String(e.message), /incomplete/)
}

console.log('makalight-nsis.test.mjs: ok')