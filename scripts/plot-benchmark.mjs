#!/usr/bin/env node
/**
 * Stub: aggregate benchmark/runs/**/metrics.csv into docs/paper/figures/README.md
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = join('docs', 'paper', 'figures')
mkdirSync(outDir, { recursive: true })
writeFileSync(
  join(outDir, 'README.md'),
  '# Figures\n\nRun benchmarks then implement plotting here (matplotlib or Vega).\n',
)
console.log('plot-benchmark stub: wrote', outDir)