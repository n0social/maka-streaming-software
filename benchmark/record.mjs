#!/usr/bin/env node
/**
 * Benchmark recorder stub — writes CSV schema + metadata on any OS.
 * Windows process sampling is TODO (typeperf / Get-Process).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
function flag(name, fallback = '') {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const stack = flag('--stack', 'makalight')
const state = flag('--state', 'idle')
const label = flag('--label', 'run01')
const duration = Number(flag('--duration', '60'))

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const dir = join('benchmark', 'runs', stamp, `${stack}_${state}_${label}`)
mkdirSync(dir, { recursive: true })

const header = 'timestamp,stack,state,run_id,private_bytes_total,cpu_percent,fps_avg,fps_1pct_low\n'
const rows = []
const start = Date.now()
const interval = setInterval(() => {
  const t = new Date().toISOString()
  rows.push(`${t},${stack},${state},${label},0,0,,`)
  if (Date.now() - start >= duration * 1000) {
    clearInterval(interval)
    writeFileSync(join(dir, 'metrics.csv'), header + rows.join('\n') + '\n')
    writeFileSync(
      join(dir, 'run.json'),
      JSON.stringify(
        { stack, state, label, durationSec: duration, platform: process.platform, stub: true },
        null,
        2,
      ),
    )
    console.log('Wrote', dir)
  }
}, 1000)