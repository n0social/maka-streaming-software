# Debug — Step 4: Shell + intro

**Electron:** `shell:open-stream` focuses studio; `shell:open-home` → makalive.stream; intro `#app-intro` → Stream calls `enterStudioFromIntro()` (renderer-only).

**MakaLight:** [`app_shell.go`](../desktop-wails/app_shell.go) — `OpenStream` un-minimises/shows window, sets studio mode, emits `shell:stream`. `OpenHome` opens the home URL. `OpenExternal` allows only `http(s):` and `mailto:`.

## Automated

```bash
cd desktop-wails && go test ./... -v
npm run verify:makalight-parity
```

Includes `TestShellExternalURLAllowed` and settings onboarding round-trip.

## UI (preview)

```bash
npm run makalight:bundle
npm run makalight:preview
# Chrome → http://127.0.0.1:8765/
```

1. Splash **Stream** hides `#app-intro` (renderer logic).
2. Onboarding tour starts if `onboardingComplete` is false (mock settings in preview).
3. **Replay onboarding tour** in Settings persists via `SetSettings` (real app uses `%AppData%/Maka/store/settings.json`).

## Windows

```bash
wails dev
```

1. Launch shows intro overlay.
2. **Stream** → studio + optional onboarding tour.
3. From code/console: `window.maka.openStream()` focuses window; `openHome()` opens browser to makalive.stream.

## Pass criteria

- Intro visibility matches Electron (no extra DOM changes).
- `onboardingComplete` survives restart.
- Blocked `openExternal('javascript:…')` on the Go side.