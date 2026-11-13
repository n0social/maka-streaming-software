#!/usr/bin/env node
/**
 * Sanity-check public site HTML.
 *
 * Home and download are the restored cream-and-gold pages, so they are checked
 * for the product words those pages share. Cloud-vendor terms stay required on
 * the stream and preview pages, which still carry that copy. seo.json must parse.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
JSON.parse(readFileSync(join(root, 'site', 'seo.json'), 'utf8'))

const pages = [
  { file: 'site/index.html', mustInclude: ['MAKA', 'Download', 'Windows'] },
  { file: 'site/download.html', mustInclude: ['Download', 'Windows', 'relay'] },
  { file: 'site/stream/index.html', mustInclude: ['cloud', 'GeForce NOW'] },
  { file: 'site/preview/index.html', mustInclude: ['cloud', 'PVP'] },
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

if (failed) {
  console.error(`verify-site-seo: ${failed} check(s) failed`)
  process.exit(1)
}
console.log('verify-site-seo: OK')
