import { strict as assert } from 'node:assert'
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = join(root, 'out', 'renderer')
const fixtureAssets = join(fixtureDir, 'assets')
const bridge = join(root, 'desktop-wails', 'frontend', 'maka-bridge.js')

const sampleHtml = `<!doctype html>
<html><body data-mode="studio">
<div id="studio-source-browser">Overlay</div>
<script type="module" crossorigin src="./assets/app-test_hash.js"></script>
</body></html>`

mkdirSync(fixtureAssets, { recursive: true })
writeFileSync(join(fixtureDir, 'app.html'), sampleHtml)
writeFileSync(join(fixtureDir, 'app.js'), '// fixture')
if (!readFileSync(bridge, 'utf8')) throw new Error('missing bridge')

execFileSync('node', ['scripts/sync-makalight-frontend.mjs'], { cwd: root, stdio: 'pipe' })

const distHtml = readFileSync(join(root, 'desktop-wails', 'frontend', 'dist', 'app.html'), 'utf8')
assert.ok(distHtml.includes('maka-bridge.js'))
assert.ok(readFileSync(join(root, 'desktop-wails', 'frontend', 'dist', 'index.html'), 'utf8').includes('maka-bridge.js'))
assert.ok(distHtml.includes('studio-source-browser'), '1:1 copy must keep Electron DOM')
assert.ok(!distHtml.includes('data-makalight'))

const origLines = sampleHtml.split('\n').filter((l) => l && !l.includes('script'))
const distLines = distHtml.split('\n').filter((l) => l && !l.includes('script') && !l.includes('maka-bridge'))
assert.equal(distLines.join('\n').trim(), origLines.join('\n').trim())

console.log('sync-makalight-frontend.test.mjs: ok')