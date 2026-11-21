#!/usr/bin/env node
/**
 * Windows game-audio worker — same loopback-capture package as Electron main.
 * Framed PCM on stdout: uint32le length + raw PCM bytes (repeated).
 */
import { createRequire } from 'node:module'

const pid = Number(process.argv[2])
if (!Number.isInteger(pid) || pid <= 0) {
  console.error('usage: window-audio-worker.mjs <pid>')
  process.exit(1)
}

const require = createRequire(import.meta.url)
let LoopbackCapture
try {
  ;({ LoopbackCapture } = require('loopback-capture'))
} catch (err) {
  console.error('loopback-capture unavailable:', err)
  process.exit(2)
}

const cap = new LoopbackCapture()
process.on('SIGTERM', () => {
  try {
    cap.stop()
  } catch {
    /* already stopped */
  }
  process.exit(0)
})

cap.start(pid, (chunk) => {
  const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
  const header = Buffer.alloc(4)
  header.writeUInt32LE(buf.length, 0)
  process.stdout.write(header)
  process.stdout.write(buf)
})