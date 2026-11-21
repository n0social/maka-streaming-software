# MakaLight (flagship)

Windows streaming studio: **Go + WebView2** + open [MAKA.relay](../relay/). Same studio UI as Maka Electron, without bundling Chromium.

**Migration plan:** [docs/wails-migration-plan.md](../docs/wails-migration-plan.md)  
**Port checklist (step-by-step):** [docs/makalight-port-checklist.md](../docs/makalight-port-checklist.md)

Electron (`npm run dist`) is **not** actively developed here; it remains a **benchmark baseline**.

## Status — 0.1.0 scaffold

- Wails app loads synced renderer from `frontend/dist`
- `maka-bridge.js` → `go.main.App` (relay, settings, window, WHIP)
- Capture / game audio: stubs (Phase 1)
- No in-app browser

## Cloud agent (Linux) — UI screenshots only

The studio bundle can be previewed without WebView2:

```bash
npm run makalight:bundle
npm run makalight:preview   # http://127.0.0.1:8765/
```

Preview mocks **Electron-shaped** `GetVersionInfo` / settings only for layout checks — same DOM as `out/renderer`. **Not** a substitute for Windows `wails dev`.

After each bundle: `npm run verify:makalight-parity`.

Linux `wails build` in CI may fail on Ubuntu 24.04 (Wails wants `webkit2gtk-4.0`; the image ships 4.1). **Ship `MakaLight.exe` on Windows.**

## Dev (Windows)

Prerequisites: Go 1.22+, [Wails v2](https://wails.io/docs/gettingstarted/installation), WebView2, Node 20+.

```bash
# repo root
npm ci
npm run prepare:relay
npm run makalight:bundle

cd desktop-wails
wails dev
```

Set `MAKA_REPO_ROOT` to the repo root if relay is not auto-discovered.

## Build installer

```bash
npm run makalight:bundle
cd desktop-wails
wails build
```

## Layout

```
desktop-wails/
  main.go, app.go, embed.go
  internal/relay/     # spawn open relay, WHIP HTTP
  internal/settings/  # %AppData%/MakaLight/settings.json
  frontend/
    maka-bridge.js    # window.maka for WebView2
    dist/             # npm run makalight:sync
```

## Benchmarks

See [benchmark/README.md](../benchmark/README.md) and [resource utilization analysis](../docs/resource-utilization-analysis.md).