import { strict as assert } from 'node:assert'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = join(root, 'out', 'renderer')

const sampleHtml = `<!doctype html>
<html><body data-mode="studio">
<div id="studio-source-browser"></div>
<webview src="https://example.com"></webview>
<script type="module" src="./app.js"></script>
</body></html>`

mkdirSync(fixtureDir, { recursive: true })
writeFileSync(join(fixtureDir, 'app.html'), sampleHtml)
writeFileSync(join(fixtureDir, 'app.js'), '// fixture')

execFileSync('node', ['scripts/sync-makalight-frontend.mjs'], { cwd: root, stdio: 'pipe' })

const out = readFileSync(join(root, 'desktop-wails', 'frontend', 'dist', 'app.html'), 'utf8')
assert.ok(out.includes('maka-bridge.js'))
assert.ok(!out.includes('studio-source-browser'))
assert.ok(!out.includes('<webview'))
assert.ok(out.includes('data-makalight'))

console.log('sync-makalight-frontend.test.mjs: ok')