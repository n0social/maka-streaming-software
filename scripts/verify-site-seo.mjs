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
  { file: 'site/index.html', mustInclude: ['GeForce NOW', 'Cloud Moon', 'v0.2.6.2', 'PVP'] },
  { file: 'site/download.html', mustInclude: ['Shadow PC', 'Xbox Cloud Gaming', 'lightweight'] },
  { file: 'site/stream/index.html', mustInclude: ['cloud', 'GeForce NOW'] },
  { file: 'site/preview/index.html', mustInclude: ['cloud', 'PVP'] },
]

const requiredKeywords = [
  'GeForce NOW',
  'Xbox Cloud Gaming',
  'Shadow PC',
  'Cloud Moon',
  'PVP',
  'cloud streaming',
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

const home = readFileSync(join(root, 'site/index.html'), 'utf8').toLowerCase()
for (const kw of requiredKeywords) {
  if (!home.includes(kw.toLowerCase())) {
    console.error(`site/index.html: missing global keyword "${kw}"`)
    failed++
  }
}

if (failed) {
  console.error(`verify-site-seo: ${failed} check(s) failed`)
  process.exit(1)
}
console.log('verify-site-seo: OK')
