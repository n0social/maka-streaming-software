#!/usr/bin/env node
/**
 * Dev entry — runs the open MAKA.relay from relay/src (replaces inline mock).
 * Set MAKA_RELAY_MOCK_RTMP=1 for RTMP log-only (default on non-Windows CI).
 */
import '../relay/src/index.mjs'