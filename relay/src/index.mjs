#!/usr/bin/env node
/**
 * Open MAKA.relay (0.1.1) — same HTTP contract as MAKArelay.exe.
 * Run: npm run relay:open  or  node relay/src/index.mjs
 */
import { startRelayServer } from './http-server.mjs'

startRelayServer()