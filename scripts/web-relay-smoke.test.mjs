#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const base = process.env.RELAY_BASE ?? 'http://127.0.0.1:38473'

let child = null
if (process.argv.includes('--spawn')) {
  child = spawn(process.execPath, ['scripts/web-relay-dev.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] })
  await sleep(800)
}

try {
  const healthRes = await fetch(`${base}/health`)
  const health = await healthRes.json()
  if (!healthRes.ok || health.ok !== true || !health.relayToken) {
    throw new Error(`health shape mismatch: ${JSON.stringify(health)}`)
  }
  console.log('OK health', health.version)

  const statusBare = await fetch(`${base}/status`)
  if (statusBare.status !== 401) throw new Error(`expected 401 without token, got ${statusBare.status}`)

  const auth = { Authorization: `Bearer ${health.relayToken}`, Accept: 'application/json' }

  const configRes = await fetch(`${base}/config`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile: '720p30', twitchKey: 'live_test_key_1234567890' }),
  })
  if (!configRes.ok) throw new Error(`config failed ${configRes.status}`)

  const statusRes = await fetch(`${base}/status`, { headers: auth })
  const status = await statusRes.json()
  if (!statusRes.ok || status.status !== 'idle') throw new Error(`status: ${JSON.stringify(status)}`)
  console.log('OK config + status')

  const verifyRes = await fetch(`${base}/config/verify`, { method: 'POST', headers: auth })
  const verify = await verifyRes.json()
  if (!verifyRes.ok || verify.ok !== true) throw new Error(`verify: ${JSON.stringify(verify)}`)
  console.log('OK verify')

  console.log('web-relay-smoke: PASSED')
} catch (err) {
  console.error('web-relay-smoke: FAILED', err)
  process.exitCode = 1
} finally {
  child?.kill('SIGINT')
}
