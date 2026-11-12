import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  RETIRED_ADDON_IDS,
  isRetiredAddonId,
  omitRetiredAddons,
} from '../src/shared/retired-addons.ts'

const catalogSrc = readFileSync(new URL('../src/shared/marketplace-catalog.ts', import.meta.url), 'utf8')
const feed = JSON.parse(readFileSync(new URL('../site/marketplace.json', import.meta.url), 'utf8'))
const feedIds = feed.map((entry) => entry.catalogId)

for (const retired of RETIRED_ADDON_IDS) {
  assert.equal(catalogSrc.includes(`'${retired}'`), false, `${retired} is still in the bundled catalog`)
  assert.equal(feedIds.includes(retired), false, `${retired} is still in site/marketplace.json`)
  assert.equal(isRetiredAddonId(retired), true)
}
assert.equal(isRetiredAddonId('com.maka.phone-cam'), false)
assert.ok(catalogSrc.includes("'com.maka.phone-cam'"))
assert.ok(catalogSrc.includes("'com.maka.custom-rtmp'"))
assert.ok(feedIds.includes('com.maka.custom-rtmp'))
assert.ok(feedIds.includes('com.maka.discord-now-live'))

const merged = omitRetiredAddons([
  {
    catalogId: 'com.tabcast.lower-thirds',
    manifest: { id: 'com.tabcast.lower-thirds' },
  },
  {
    catalogId: 'com.maka.phone-cam',
    manifest: { id: 'com.maka.phone-cam' },
  },
  {
    catalogId: 'com.example.hello-tabcast',
    manifest: { id: 'com.example.hello-tabcast' },
  },
  {
    catalogId: 'kept.remote',
    manifest: { id: 'tabcast.scene-templates' },
  },
])
assert.deepEqual(
  merged.map((entry) => entry.catalogId),
  ['com.maka.phone-cam'],
)

console.log('retired-addons.test.mjs: ok')
