# Debug — Step 5: Scene image + recording I/O

**Electron:** `scene:pick-image`, `scene:read-image-data-url`, `recording:save`, `recording:pick-folder` ([`scene-image-io.ts`](../src/main/scene-image-io.ts), [`recording-io.ts`](../src/main/recording-io.ts)).

**MakaLight:** [`app_recording.go`](../desktop-wails/app_recording.go) + [`internal/sceneimage`](../desktop-wails/internal/sceneimage/scene.go) + [`internal/recording`](../desktop-wails/internal/recording/save.go).

## Automated

```bash
cd desktop-wails && go test ./... -v
npm run verify:makalight-parity
```

## Windows / desktop (`wails dev`)

1. **Scene image** — Settings or scene panel → upload PNG/JPG → picker returns `path` + `dataUrl`.
2. **Recording folder** — Settings → recording path → `pickRecordingFolder`.
3. **Stop recording** — normal stop writes to `recordingSaveFolder`; Shift+stop forces save dialog.

## Pass criteria

- Same `{ canceled }` / `{ filePath }` shapes as Electron.
- Recording bytes cap 2 GiB; scene images cap 25 MiB.
- `forceDialog: true` always prompts even when folder is set.