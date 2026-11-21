import { strict as assert } from 'node:assert'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureRoot = join(tmpdir(), `makalight-sync-test-${process.pid}`)
const fixtureDir = join(fixtureRoot, 'renderer')
const fixtureAssets = join(fixtureDir, 'assets')
const destRoot = join(fixtureRoot, 'dist')
const bridge = join(root, 'desktop-wails', 'frontend', 'maka-bridge.js')

const sampleHtml = `<!doctype html>
<html><body data-mode="studio">
<div id="studio-source-browser">Overlay</div>
<script type="module" src="./app.js"></script>
</body></html>`

try {
  rmSync(fixtureRoot, { recursive: true, force: true })
  mkdirSync(fixtureAssets, { recursive: true })
  writeFileSync(join(fixtureDir, 'app.html'), sampleHtml)
  writeFileSync(join(fixtureDir, 'app.js'), '// fixture')
  if (!readFileSync(bridge, 'utf8')) throw new Error('missing bridge')

  execFileSync('node', ['scripts/sync-makalight-frontend.mjs'], {
    cwd: root,
    stdio: 'pipe',
    env: {
      ...process.env,
      MAKA_RENDERER_SRC: fixtureDir,
      MAKA_WAILS_DIST: destRoot,
    },
  })

  const distHtml = readFileSync(join(destRoot, 'app.html'), 'utf8')
  assert.ok(distHtml.includes('maka-bridge.js'))
  assert.ok(distHtml.includes('studio-source-browser'), '1:1 copy must keep Electron DOM')
  assert.ok(!distHtml.includes('data-makalight'))

  const origLines = sampleHtml.split('\n').filter((l) => l && !l.includes('script'))
  const distLines = distHtml.split('\n').filter((l) => l && !l.includes('script') && !l.includes('maka-bridge'))
  assert.equal(distLines.join('\n').trim(), origLines.join('\n').trim())

  console.log('sync-makalight-frontend.test.mjs: ok')
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true })
}