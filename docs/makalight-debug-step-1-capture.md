# Debug — Step 1: Capture list + preferred source

**Electron:** `capture:list-sources`, `capture:set-preferred` in `src/main/index.ts`.

**MakaLight:** `ListCaptureSources()`, `SetPreferredCaptureSource()` → `internal/capture/`.

## Automated (any OS)

```bash
cd desktop-wails && go test ./internal/capture/... -v
```

## Windows (real capture IDs for WebView2)

```bash
npm run makalight:bundle
cd desktop-wails
wails dev
```

1. Open studio → **Game capture** picker (⋯ or source list).
2. Expect **screens** and **windows** (names + thumbnails where available).
3. Pick a source → `SetPreferredCaptureSource` should stick (Go stores id; preview in logs if enabled).
4. Start capture / Go Live → video should bind via `chromeMediaSourceId` (same constraints as Electron).

## Linux cloud agent

Sources list returns `[]` (no Win32 APIs). UI still loads; verify parity only:

```bash
npm run verify:makalight-parity
```

## Pass criteria

- DTO: `{ id, name, type: 'screen'|'window', thumbnailDataUrl }` per source (no extra fields).
- Window ids: `window:<hwnd>:0`; screen ids: `screen:<index>:0` (Chromium desktop id shape).
- Errors in list → `[]` (same as Electron `ipcTry` fallback).