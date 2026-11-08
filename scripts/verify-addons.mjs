#!/usr/bin/env node
/**
 * Smoke-check marketplace catalog + on-disk addon samples before release.
 * Usage: node scripts/verify-addons.mjs [--write-report]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const writeReport = process.argv.includes('--write-report')

const ADDON_API_VERSION = 1
const ADDON_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,127}$/
const SCENE_TEMPLATE_IDS = new Set([
  'gaming-cam',
  'desk-only',
  'starting-soon',
  'intermission',
  'ending',
  'browse-showcase',
])

const PERMISSIONS = new Set([
  'ui.toast',
  'ui.external',
  'scene.overlay',
  'scene.layout',
  'browse.tabs.read',
  'relay.config.read',
  'relay.config.write',
  'network.fetch',
  'live.events',
  'device.phone-pair',
])

function validateManifest(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Manifest must be a JSON object' }
  const m = raw
  if (!ADDON_ID_RE.test(m.id)) return { ok: false, error: 'Invalid addon id' }
  if (typeof m.name !== 'string' || !m.name.trim()) return { ok: false, error: 'Missing name' }
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+/.test(m.version)) {
    return { ok: false, error: 'Invalid semver version' }
  }
  const apiVersion = typeof m.apiVersion === 'number' ? m.apiVersion : 1
  if (apiVersion !== ADDON_API_VERSION) return { ok: false, error: `apiVersion ${apiVersion}` }
  if (Array.isArray(m.permissions)) {
    for (const p of m.permissions) {
      if (!PERMISSIONS.has(p)) return { ok: false, error: `Unknown permission ${p}` }
    }
  }
  return { ok: true, manifest: m }
}

function checkDeclarativeActions(manifest) {
  const issues = []
  const panels = manifest.contributes?.sidebarPanels
  if (!panels) return issues
  for (const panel of panels) {
    for (const action of panel.actions ?? []) {
      if (action.type === 'scene-template' && !SCENE_TEMPLATE_IDS.has(action.templateId)) {
        issues.push(`Unknown scene template ${action.templateId} (${action.id})`)
      }
      if (action.type === 'open-url' && !String(action.url).startsWith('https://')) {
        issues.push(`open-url must be https (${action.id})`)
      }
    }
  }
  return issues
}

function loadMarketplaceJson() {
  const path = join(root, 'site', 'marketplace.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Manifest-only entries embedded in marketplace-catalog.ts (no imported file bundles). */
function loadStaticCatalogManifests() {
  const catalogPath = join(root, 'src', 'shared', 'marketplace-catalog.ts')
  const raw = readFileSync(catalogPath, 'utf8')
  const manifests = []
  const re = /manifest:\s*(\{[\s\S]*?\})\s*,?\s*(?:files:|featured:|catalogId:|\})/g
  let match
  while ((match = re.exec(raw)) !== null) {
    try {
      manifests.push(JSON.parse(match[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"')))
    } catch {
      // fallback: skip blocks that are not JSON-serializable
    }
  }
  return manifests
}

const results = []

function record(id, ok, detail) {
  results.push({ id, ok, detail })
}

const marketplaceJson = loadMarketplaceJson()
if (marketplaceJson) {
  for (const entry of marketplaceJson) {
    const id = entry.catalogId ?? entry.manifest?.id ?? 'unknown'
    const validated = validateManifest(entry.manifest)
    if (!validated.ok) {
      record(id, false, validated.error)
      continue
    }
    const actionIssues = checkDeclarativeActions(entry.manifest)
    if (actionIssues.length) {
      record(id, false, actionIssues.join('; '))
    } else {
      record(id, true, 'marketplace.json manifest')
    }
  }
} else {
  record('site/marketplace.json', false, 'missing file')
}

for (const manifest of loadStaticCatalogManifests()) {
  const id = manifest.id ?? 'unknown'
  if (results.some((r) => r.id === id)) continue
  const validated = validateManifest(manifest)
  if (!validated.ok) {
    record(id, false, `catalog: ${validated.error}`)
    continue
  }
  const actionIssues = checkDeclarativeActions(manifest)
  record(id, actionIssues.length === 0, actionIssues.join('; ') || 'catalog manifest')
}

const helloDir = join(root, 'addons', '_samples', 'hello-tabcast')
const helloManifestPath = join(helloDir, 'tabcast-addon.json')
if (existsSync(helloManifestPath)) {
  const raw = JSON.parse(readFileSync(helloManifestPath, 'utf8'))
  const v = validateManifest(raw)
  const entry = raw.entry || 'index.html'
  const entryOk = existsSync(join(helloDir, entry))
  record(
    'com.example.hello-tabcast (sample)',
    v.ok && entryOk,
    v.ok ? `tabcast-addon.json + ${entry}` : v.error,
  )
} else {
  record('com.example.hello-tabcast (sample)', false, 'missing tabcast-addon.json')
}

const helloBundle = join(root, 'src', 'shared', 'hello-tabcast-files.ts')
const phoneBundle = join(root, 'src', 'shared', 'phone-cam-files.ts')
if (existsSync(helloBundle)) {
  const src = readFileSync(helloBundle, 'utf8')
  record(
    'com.example.hello-tabcast (bundle)',
    src.includes("'index.html':") && src.includes("'index.js':"),
    'hello-tabcast-files.ts exports index.html + index.js',
  )
}
if (existsSync(phoneBundle)) {
  const src = readFileSync(phoneBundle, 'utf8')
  record(
    'com.tabcast.phone-cam (bundle)',
    src.includes("'index.html':") && src.includes('qrcode.bundle.js'),
    'phone-cam-files.ts exports panel + QR bundle',
  )
}

const failed = results.filter((r) => !r.ok)

console.log('Addon validation\n')
for (const r of results) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} — ${r.detail}`)
}
console.log('')
if (failed.length) {
  console.error(`Addon validation FAILED (${failed.length})`)
  process.exitCode = 1
} else {
  console.log('Addon validation PASSED')
}

if (writeReport) {
  const reportPath = join(root, 'docs', 'addon-validation-report.md')
  const lines = [
    '# Addon validation report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Addon id | Result | Detail |',
    '| --- | --- | --- |',
    ...results.map((r) => `| ${r.id} | ${r.ok ? 'PASS' : 'FAIL'} | ${String(r.detail).replace(/\|/g, '\\|')} |`),
    '',
    failed.length
      ? `**Overall:** FAIL (${failed.length} issue(s))`
      : '**Overall:** PASS',
    '',
  ]
  writeFileSync(reportPath, lines.join('\n'), 'utf8')
  console.log(`Wrote ${reportPath}`)
}
