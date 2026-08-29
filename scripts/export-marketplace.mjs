#!/usr/bin/env node
/** Writes site/marketplace.json from the bundled TypeScript catalog (via dynamic import). */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = join(root, 'site', 'marketplace.json')

// Catalog is plain data — import compiled output after build, or inline read from source.
// For CI/dev, read the TS module through a minimal JSON re-export pattern.
const catalogPath = join(root, 'src', 'shared', 'marketplace-catalog.ts')
const raw = await import('node:fs/promises').then((fs) => fs.readFile(catalogPath, 'utf8'))

// Extract MARKETPLACE_CATALOG array via eval-free JSON slice (catalog is valid JSON-like).
const match = raw.match(/export const MARKETPLACE_CATALOG[^=]*=\s*(\[[\s\S]*?\n\])/)
if (!match) {
  console.error('Could not parse MARKETPLACE_CATALOG from marketplace-catalog.ts')
  process.exit(1)
}

// eslint-disable-next-line no-eval
const catalog = new Function(`return ${match[1]}`)()
const payload = catalog.filter((e) => !e.manifest?.builtin)

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`Wrote ${payload.length} marketplace entries → ${outPath}`)
