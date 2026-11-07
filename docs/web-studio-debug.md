# Web studio debug pass — `site/stream/`

**Date:** 2026-11-07  
**Branch:** `cursor/web-studio-port-dc6d`  
**Scope:** 1:1 exe port under `site/stream/` (`index.html`, `stream.css`, `css/*`, `js/*`)  
**Method:** Static asset/ID/syntax checks + `python3 -m http.server` on `site/` (:8790) + headless Chrome (CDP) instrumentation. **No deploy. No droplet / skydav.work.**

**Screenshot:** `/opt/cursor/artifacts/web-studio-debug-layout.png` (1440×900). Companion 1100×700: `/opt/cursor/artifacts/web-studio-debug-layout-1100x700.png`.

---

## Verdict

The page **boots cleanly**. All six modules initialize. Layout containment holds at 1440×900 and 1100×700 (center does **not** expand over sidebars). Scenes, preview chrome, audio mixer, live probe honesty, and settings persistence are largely present.

The wiring pass should prioritize **source-row ↔ preview capture conflicts**, **dead Stream Controls chrome** (recording / vcam / marketplace / platform chips / studio↔browser mode), and **live’s secondary preview global name** (`MakaPreview` vs `MakaStreamPreview`). Nothing found that blocks first paint; no 5-line load-blocker was patched in this pass.

---

## 1. Static integrity

| Check | Result |
| --- | --- |
| Script / link hrefs under `/stream/` | All resolve locally (200): `./js/{shell,scenes,preview,audio,live,settings}.js`, `./css/{shell,preview-stage,scenes,audio,live,settings}.css`, `./stream.css`, `/maka.css`, `/marketing/favicon-32.png`, `/download.html` |
| JS syntax | `node --check` OK on all `js/*.js` + `stream.js` |
| CSS braces / `@import` | All feature CSS brace-balanced. `stream.css` only `@import url("./css/shell.css")` — **redundant** with `<link href="./css/shell.css">` in `index.html` (double fetch of shell) |
| Duplicate IDs in `index.html` | **None** (99 unique) |
| Required hooks | Present: `#studio-preview`, `#audio-mixer`, `#btn-settings`, `#studio-settings`, `#btn-go-live`, `#btn-go-live-sidebar`, `#relay-chip`, `#studio-scenes`, `#program` |
| Orphan shim | `stream.js` exists (live.js loader shim) but is **not** referenced by `index.html` (harmless; modules already load live.js) |
| Marketplace dialog | `#btn-open-marketplace` has `aria-controls="marketplace-dialog"` but **`#marketplace-dialog` is missing** |

---

## 2. Boot path

Served: `site/` → `http://127.0.0.1:8790/stream/`.

### Console (headless)

| Level | Message | Notes |
| --- | --- | --- |
| error | CSP `frame-ancestors` ignored via `<meta>` | Expected browser behavior; use HTTP header in real deploy |
| error | `ERR_CONNECTION_REFUSED` → `127.0.0.1:38473/health` and `localhost:38473/health` | Expected when relay sidecar absent; live.js probes both |
| pageerror | *(none)* | |
| warnings | *(none)* | |

Asset 404s: **none** for studio modules/CSS. Transient `ERR_ABORTED` noise during navigation teardown is not a missing-module failure (confirmed with in-page `HEAD` → all 200).

### Module init confirmation

| Module | Init signal | Status |
| --- | --- | --- |
| shell | `.app[data-shell-ready="1"]`, overflow locks | OK — also calls `initPreview` |
| scenes | `window.MakaScenes`, `window.initScenes` | OK — auto-boot |
| preview | `#studio-preview[data-preview-ready="1"]`, `window.MakaStreamPreview`, `window.initPreview` | OK — via shell import (script tag is redundant ESM re-entry; idempotent) |
| audio | `window.MakaStreamAudio`, meters upgraded with faders/mutes | OK — auto-boot into `#audio-mixer` |
| live | `window.MakaLive`, `window.initLive` | OK — auto-boot; relay probe runs |
| settings | `#studio-settings` panels populated; `window.MakaStudioSettings` | OK — script tag present; opens via `#btn-settings` |

---

## 3. Layout (overflow regression)

| Viewport | Left | Stage | Right | Stage overlaps sidebars? | Horizontal overflow? | Preview stage aspect |
| --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | x0 w252 | x252 w892 | x1144 w296 | **No** | **No** | **1.777** (16:9) |
| 1100×700 | x0 w252 | x252 w552 | x804 w296 | **No** | **No** | **~1.775** (16:9) |

`.app` / `.stage` / `#studio-preview` use `overflow: hidden` + `minmax(0,1fr)` grid. Prior “center expands over sidebars” bug is **not** reproducing. Cream margins around the 16:9 frame are intentional containment, not unbounded growth.

---

## 4. Scenes / Sources

| Action | Result |
| --- | --- |
| Click scene (`starting-soon`) | Fires `maka:scene-change` + `maka:scenes-change`; active attr updates |
| Add scene (`#btn-add-scene-alt`) | Scene count 5 → 6 (`custom-1`); persists |
| localStorage | Key **`maka.stream.scenes.v1`** written with `activeSceneId`, `customScenes`, `layers`, `sourceActive` |
| Source row click | Toggles layer visibility (`toggleLayerForSourceKind`) — **does not** expand picker |
| Source ⋯ menu | Expands picker (`aria-expanded=true`); mock copy: “Capture device lists are not available in this browser mock…” |

**Note:** Each intentional emit reaches `window` listeners **twice** (dispatch on `root` *and* `window`, with bubbling). Harmless today; noisy for subscribers.

**Conflict (resolved in wiring layer 1):** `preview.js` no longer binds `#studio-source-game` / `#studio-source-webcam` for capture; those rows only toggle layers. Capture is Share screen / Add webcam only.

---

## 5. Preview

| Check | Result |
| --- | --- |
| `initPreview` | Present (`window.initPreview` + shell call) |
| Capture buttons | `[data-preview="btn-screen"]` “Share screen”, `[data-preview="btn-webcam"]` “Add webcam” injected into stage |
| Legacy IDs | `#btn-screen` / `#btn-webcam` / `#btn-mic` / `#program-canvas` **absent** (live.js owns-capture path stays dormant — correct when preview owns the stage) |
| 16:9 frame | `.preview-stage` contained; aspect ≈ 1.778; host/stage `overflow: hidden` |
| Unbounded canvas growth | **Not observed** |
| `getDisplayMedia` / `getUserMedia` | Require user gesture + permissions; **not failed as a pass criterion** in headless. Documented only. |

---

## 6. Audio

| Check | Result |
| --- | --- |
| Mixer mount | `#audio-mixer` + `data-maka-audio-mixer` |
| API | `window.MakaStreamAudio` with `setStream` / `getStream` / mute / gain / `channels: [desktop,mic,game]` |
| Idle meters | Desktop **12%**, Mic **0%**, Game **12%**; `data-idle="1"`; desktop/game `data-capture-unavailable="1"` |
| CSS | `./css/audio.css` **is linked** in `index.html` |
| Mic ⚙ id | Static HTML mic settings button lacks `id="btn-mic-audio-settings"`; after upgrade still `(no id)` — settings event for mic gear may not target correctly |

---

## 7. Live / Relay

| Check | Result |
| --- | --- |
| Probe UX | Chip + `#relay-status-text` → **“Relay not detected”**; `#relay-detail` explains local sidecar only |
| Go Live without capture | **Disabled**; title: “Add a webcam or screen share preview first” |
| Go Live with capture, no relay | Enables; click opens `#relay-modal` with honest “No local relay… will not claim a cloud stream” copy; `#stream-live-pill` stays `data-live="false"` / Offline; `MakaLive.isLive() === false` |
| Fake CDN live | **None** observed |
| `#btn-relay-refresh` | **Missing** — probe is boot-only unless Go Live re-probes |

---

## 8. Settings

| Check | Result |
| --- | --- |
| Open via `#btn-settings` | `body[data-mode=settings]`, `#studio-settings` unhidden, `aria-pressed=true` |
| Tabs | General, Streaming, Audio, Video / System, Recording, Studio & Browser, Help — all panels real copy |
| Persistence | `maka.stream.settings.v1` (+ shared `maka.stream.streamTitle` / `streamCategory` / `bitrateProfile`) |
| Gibberish placeholders | **None** (`lorem` / `TODO stub` / `[object Object]` not found) |
| Close | `#tab-stream` restores studio mode |
| Script tag | **Present** (`./js/settings.js`) |

---

## 9. Integration gaps (wiring checklist)

Ordered by impact for the next wiring pass:

1. **Source row ↔ preview capture collision** — Row click toggles scene layers *and* kicks `getDisplayMedia`/`getUserMedia`. Capture should follow picker / explicit Share buttons, not layer toggle.
2. **Dead Stream Controls / stats chrome (HTML only)** — No handlers in `site/stream/js/*` for:
   - `#btn-start-recording`, `#btn-start-vcam`, `#stat-recording` / `#stat-vcam`
   - `#btn-open-marketplace` (and missing `#marketplace-dialog`)
   - `#plat-twitch`, `#plat-youtube`
   - `#program-output-mode` (Studio ↔ Browser)
   - Encode select sync beyond hidden `#cfg-profile` / settings
3. **Live preview API alias** — `live.js` `getPreviewApi()` falls back to `window.MakaPreview`, but preview publishes `window.MakaStreamPreview`. Host `_makaPreview` works today; alias mismatch is a landmine if the host is remounted.
4. **Audio mic settings id** — Missing `btn-mic-audio-settings` on the mic ⚙ control after mount upgrade.
5. **Scenes event double-fire** — `emit()` dispatches on both `root` and `window`.
6. **Redundant CSS load** — `stream.css` `@import` shell + direct `<link>` to shell.css.
7. **Orphan `stream.js`** — Not in script tags; either delete or document as unused.
8. **Preview ↔ scenes scene-card race** — Preview also listens to raw `[data-scene]` clicks in parallel with `maka:scene-change` (works, but dual paths).
9. **Chat / notifications program slots** — Intentionally placeholder (“not wired yet”); leave until feed exists.
10. **Recording / vcam / marketplace** — Expected exe parity gaps on web; do not fake CDN or file-system recording without a defined browser strategy.

**Already OK (do not re-litigate as missing):** `audio.css` is linked; `settings.js` is in script tags; `#studio-preview` receives `maka:scene-change` and updates scene name / card.

---

## 10. Severity list

### P0 — blockers

*(none for page load / first paint)*

### P1 — broken or misleading UX

| ID | Issue | Recommended first fix |
| --- | --- | --- |
| P1-1 | ~~Game/Webcam source row click starts capture while also toggling layer~~ **FIXED** (wiring layer 1) | Row = layer only; Share screen / Add webcam = capture. preview no longer binds `#studio-source-*`. |
| P1-2 | Start Recording / Virtual Camera / Browse addons / Twitch·YouTube chips / Studio Mode select are inert | Wire or explicitly disable + tooltip (“desktop only” / “coming soon”) so chrome is honest |
| P1-3 | Marketplace button references missing `#marketplace-dialog` | Add dialog stub or remove `aria-controls` / hide button until ported |

### P2 — polish

| ID | Issue |
| --- | --- |
| P2-1 | `live.js` should accept `MakaStreamPreview` (or set alias) |
| P2-2 | Mic channel settings button missing stable id |
| P2-3 | Duplicate `maka:scene-change` deliveries |
| P2-4 | Drop `stream.css` `@import` **or** the extra shell `<link>` |
| P2-5 | CSP `frame-ancestors` via meta; orphan `stream.js`; no manual relay-refresh control |
| P2-6 | Stats bar crowding at 1100×700 (Dropped Frames vs Not recording) |

---

## Wiring layer 1 — fixed

**P1-1 done** (this pass only; no deploy):

- Removed `preview.js` click listeners on `#studio-source-game` / `#studio-source-webcam` that called `startScreen()` / `startWebcam()` (and thus `getDisplayMedia` / `getUserMedia`).
- Source rows remain **layer visibility toggles** only (`scenes.js` → `toggleLayerForSourceKind`). Capture stays on program-stage **Share screen** / **Add webcam** (`[data-preview="btn-screen"]` / `[data-preview="btn-webcam"]`), plus legacy `#btn-screen` / `#btn-webcam` if present.
- Click contract documented at the top of `site/stream/js/scenes.js` and `site/stream/js/preview.js`.
- Picker copy for game/webcam points users to the preview capture buttons.

**Still open for later layers:** P1-2, P1-3, P2-*.

---

## Wiring-pass priority (recommended order)

1. ~~**P1-1** source ↔ preview click semantics~~ **FIXED** (wiring layer 1).  
2. **P1-2 / P1-3** honesty pass on inert controls (disable + copy beats silent no-ops).  
3. **P2-1** live ↔ preview API naming.  
4. Optional: audio mic id, event emit once, CSS dedupe.

---

## Evidence appendix

```text
Boot globals: MakaScenes, MakaStreamPreview, MakaStreamAudio, MakaLive, MakaStudioSettings
Relay: isRelayDetected=false; live pill Offline after failed go-live
Scenes storage key: maka.stream.scenes.v1
Settings storage key: maka.stream.settings.v1
Layout artifact: /opt/cursor/artifacts/web-studio-debug-layout.png
Raw machine report: /tmp/web-studio-debug/report.json
```
