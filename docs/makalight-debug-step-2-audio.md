# Debug — Step 2: Window game audio

**Electron:** `window-audio:start`, `window-audio:stop`, event `window-audio:pcm` via `loopback-capture` ([`window-process-audio.ts`](../src/main/window-process-audio.ts)).

**MakaLight:** `StartWindowAudio`, `StopWindowAudio`, `EventsEmit("window-audio:pcm")` via [`internal/audio`](../desktop-wails/internal/audio/window.go) + [`window-audio-worker.mjs`](../desktop-wails/scripts/window-audio-worker.mjs).

## Automated

```bash
cd desktop-wails && go test ./internal/audio/... -v
```

On Linux: `Start` returns `{ ok: false, message: "Game audio follows a window on Windows." }`.

## Windows

Prerequisites: `npm ci`, `npm install` (for `loopback-capture`).

```bash
export MAKA_REPO_ROOT=/path/to/repo
npm run makalight:bundle
cd desktop-wails
wails dev
```

1. Pick a **window** source (not screen).
2. Enable game audio / refresh game capture (studio auto-calls `startWindowAudio`).
3. Play sound in that app → game audio meter should move.
4. Switch source → `stopWindowAudio` + new session on restart.

Optional worker alone:

```bash
# pid of a process that is playing audio
node desktop-wails/scripts/window-audio-worker.mjs 1234 | head -c 100
```

## Pass criteria

- Same JSON as Electron on failure paths (messages match `window-process-audio.ts`).
- `{ ok: true, session: N }` increments on each start.
- PCM events include matching `session`; stale sessions ignored in renderer.