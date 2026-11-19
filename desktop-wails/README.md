# Maka Lite (Wails + WebView2)

**Control codebase** for proving lower resource use vs OBS. Reuses the web studio UI (`src/renderer/`) inside the OS WebView instead of bundling Chromium (Electron).

## Hypothesis

| Stack | Expected win |
| --- | --- |
| Maka Electron | Bundled Chromium + Node + MAKArelay |
| Maka Wails | WebView2 (shared OS engine) + Go backend + open MAKA.relay |

Measure idle / streaming / in-game using [`docs/resource-utilization-analysis.md`](../docs/resource-utilization-analysis.md).

## Status

Scaffold only. Next steps:

1. `wails init` → bind Go methods mirroring [`src/preload/index.ts`](../src/preload/index.ts).
2. Windows capture (WGC/DXGI) + WASAPI game audio in Go.
3. Launch open relay from [`relay/`](../relay/) or fold WHIP+FFmpeg into Go.
4. Load built renderer assets (`out/renderer` or `site/stream` dev).

## Prerequisites (Windows)

- Go 1.22+
- [Wails v2](https://wails.io/docs/gettingstarted/installation)
- WebView2 runtime (preinstalled on Windows 11)

## Planned layout

```
desktop-wails/
  main.go          # Wails app + lifecycle
  internal/
    capture/       # DXGI / WGC
    relay/         # spawn relay/src or native WHIP
    bridge/        # JS bindings (window.maka)
  frontend/        # symlink or copy of studio bundle
```