package main

import "embed"

// Studio UI synced from electron-vite renderer via scripts/sync-makalight-frontend.mjs
//
//go:embed all:frontend/dist
var assets embed.FS