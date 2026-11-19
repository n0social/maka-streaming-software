#!/usr/bin/env node
/**
 * Sanity-check public site HTML against site/seo.json keyword targets.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const seo = JSON.parse(readFileSync(join(root, 'site', 'seo.json'), 'utf8'))

const pages = [
  { file: 'site/index.html', mustInclude: ['MAKA', 'Download', 'Windows'] },
  { file: 'site/download.html', mustInclude: ['Download', 'Windows', 'Maka'] },
  { file: 'site/stream/index.html', mustInclude: ['cloud', 'GeForce NOW'] },
  { file: 'site/preview/index.html', mustInclude: ['cloud', 'PVP'] },
]

const streamVendorKeywords = [
  'GeForce NOW',
  'Xbox Cloud Gaming',
  'Shadow PC',
  'Cloud Moon',
  'PVP',
  'cloud gamer',
]

let failed = 0

for (const { file, mustInclude } of pages) {
  const path = join(root, file)
  if (!existsSync(path)) {
    console.error(`Missing ${file}`)
    failed++
    continue
  }
  const html = readFileSync(path, 'utf8').toLowerCase()
  for (const phrase of mustInclude) {
    if (!html.includes(phrase.toLowerCase())) {
      console.error(`${file}: missing "${phrase}"`)
      failed++
    }
  }
  if (!html.includes('name="description"') || !html.includes('canonical')) {
    console.error(`${file}: missing core meta (description and/or canonical)`)
    failed++
  }
}

const streamHtml = readFileSync(join(root, 'site/stream/index.html'), 'utf8').toLowerCase()
for (const kw of streamVendorKeywords) {
  if (!streamHtml.includes(kw.toLowerCase())) {
    console.error(`site/stream/index.html: missing vendor keyword "${kw}"`)
    failed++
  }
}

if (failed) {
  console.error(`verify-site-seo: ${failed} check(s) failed`)
  process.exit(1)
}
console.log('verify-site-seo: OK')