# Web studio debug pass — `site/stream/`

**Date:** 2026-11-07  
**Branch:** `cursor/web-studio-port-dc6d`  
**Scope:** 1:1 exe port under `site/stream/` (`index.html`, `stream.css`, `css/*`, `js/*`)  
**Method:** Static asset/ID/syntax checks + `python3 -m http.server` on `site/` (:8790) + headless Chrome (CDP) instrumentation. **No deploy. No droplet / skydav.work.**

**Screenshot:** `/opt/cursor/artifacts/web-studio-debug-layout.png` (1440×900). Companion 1100×700: `/opt/cursor/artifacts/web-studio-debug-layout-1100x700.png`.

---

## Verdict

The page **boots cleanly**. All six modules initialize. Layout containment holds at 1440×900 and 1100×700 (center does **not** expand over sidebars). Scenes, preview chrome, audio mixer, live probe honesty, and settings persistence are largely present.

Wiring layers 1–3 addressed source-row ↔ preview capture conflicts, dead Stream Controls chrome (recording / vcam / marketplace / platform chips / studio↔browser mode), and the live ↔ preview API name (`MakaStreamPreview` canonical + `MakaPreview` alias). Remaining: other P2 polish (mic id, event emit, CSS dedupe, etc.). Nothing found that blocks first paint.

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
| Marketplace dialog | `#marketplace-dialog` present (wiring layer 2); Browse opens / Close works |

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
2. ~~**Dead Stream Controls / stats chrome**~~ **FIXED** (wiring layer 2) — recording / vcam / marketplace / platform chips / `#program-output-mode` wired. Encode select sync beyond hidden `#cfg-profile` / settings still optional polish.
3. ~~**Live preview API alias**~~ **FIXED** (wiring layer 3) — `preview.js` publishes `window.MakaStreamPreview` (canonical) and `window.MakaPreview` (alias); `live.js` `getPreviewApi()` resolves host `_makaPreview` → `MakaStreamPreview` → `MakaPreview`.
4. **Audio mic settings id** — Missing `btn-mic-audio-settings` on the mic ⚙ control after mount upgrade.
5. **Scenes event double-fire** — `emit()` dispatches on both `root` and `window`.
6. **Redundant CSS load** — `stream.css` `@import` shell + direct `<link>` to shell.css.
7. **Orphan `stream.js`** — Not in script tags; either delete or document as unused.
8. **Preview ↔ scenes scene-card race** — Preview also listens to raw `[data-scene]` clicks in parallel with `maka:scene-change` (works, but dual paths).
9. **Chat / notifications program slots** — Intentionally placeholder (“not wired yet”); leave until feed exists.
10. ~~**Recording / vcam / marketplace**~~ **FIXED** (wiring layer 2) with honest web strategies (MediaRecorder download; VCam preview-only PiP; browse-only marketplace). Still no fake CDN / OS VCam.

**Already OK (do not re-litigate as missing):** `audio.css` is linked; `settings.js` is in script tags; `#studio-preview` receives `maka:scene-change` and updates scene name / card.

---

## 10. Severity list

### P0 — blockers

*(none for page load / first paint)*

### P1 — broken or misleading UX

| ID | Issue | Recommended first fix |
| --- | --- | --- |
| P1-1 | ~~Game/Webcam source row click starts capture while also toggling layer~~ **FIXED** (wiring layer 1) | Row = layer only; Share screen / Add webcam = capture. preview no longer binds `#studio-source-*`. |
| P1-2 | ~~Start Recording / Virtual Camera / Browse addons / Twitch·YouTube chips / Studio Mode select are inert~~ **FIXED** (wiring layer 2) | MediaRecorder + download; VCam preview-only PiP; platform chips ↔ localStorage/settings; Studio/Browser mode on `.app` |
| P1-3 | ~~Marketplace button references missing `#marketplace-dialog`~~ **FIXED** (wiring layer 2) | `#marketplace-dialog` + catalog from `/marketplace.json` (remote feed fallback) |

### P2 — polish

| ID | Issue |
| --- | --- |
| P2-1 | ~~`live.js` should accept `MakaStreamPreview` (or set alias)~~ **FIXED** (wiring layer 3) |
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

**Still open for later layers:** remaining P2-* (P2-1 done in layer 3).

---

## Wiring layer 2 — fixed

**P1-2 / P1-3 done** (this pass only; no deploy):

1. **Recording** (`#btn-start-recording` / `#stat-recording`) — `MediaRecorder` on the preview stream (screen preferred, else webcam) when available; stop downloads a timestamped WebM; idle/recording UI synced. No stream → honest hint, does not fake a recording.
2. **Virtual Cam** (`#btn-start-vcam` / `#stat-vcam` / `#vcam-preview-mock`) — web cannot install an OS virtual camera; button toggles a labeled **preview-only** PiP canvas that mirrors the program frame. Tooltip/copy state that clearly. Does **not** claim a system camera device.
3. **Marketplace** — added `#marketplace-dialog` (+ list/refresh/close). Browse opens dialog; Close works. Catalog from `/marketplace.json` with optional remote feed URLs (`tabcast.live` / `skydav.work`); sidebar preview fills from the same list. Install actions are browse-only (desktop installs).
4. **Twitch / YouTube chips** — toggle `data-state` armed/off; persist `maka.stream.platformPref.v1`; sync primary into settings `lastStreamPlatform` / `#set-last-platform`. Settings dropdown exclusive-syncs chips via `maka:settings-platform-sync`.
5. **Studio Mode** (`#program-output-mode`) — switches `.app[data-output-mode]` + `body[data-mode]` studio/browse layout hint; persists as `startupMode`; matches Settings → Studio & Browser startup buttons via `maka:startup-mode-change`.

Layer 1 scenes/preview click contract unchanged (source rows = layers; Share screen / Add webcam = capture).

**Still open:** remaining P2-* (P2-1 done in layer 3).

---

## Wiring layer 3 — fixed

**P2-1 done** (this pass only; no deploy):

- Canonical public API: `window.MakaStreamPreview` (same object as `#studio-preview._makaPreview`).
- Back-compat alias: `window.MakaPreview = MakaStreamPreview` (cleared on `destroy` when it was this instance).
- `live.js` `getPreviewApi()` resolves host → `MakaStreamPreview` → `MakaPreview`; used by Go Live / WHIP (`readPreviewStreams` / `hasCapture` / `buildPublishSources`), Recording (`pickPreviewRecordStream`), and Virtual Cam (`paintVcamFrame`).
- One-line contract comment on `preview.js` export header.

**Still open:** P2-2 … P2-6.

---

## Wiring-pass priority (recommended order)

1. ~~**P1-1** source ↔ preview click semantics~~ **FIXED** (wiring layer 1).  
2. ~~**P1-2 / P1-3** honesty pass on inert controls~~ **FIXED** (wiring layer 2).  
3. ~~**P2-1** live ↔ preview API naming~~ **FIXED** (wiring layer 3).  
4. Optional: audio mic id, event emit once, CSS dedupe.

---

## Sequential fix layer 1 — scenes

**Done** (this pass only; no deploy). Scope: `site/stream/` scenes rail + program bumper overlay. Sources pickers, audio meters, and browser-tab copy unchanged.

1. **Canonical scenes** — Fixed list only: **Gameplay**, **Starting Soon**, **Intermission**, **Ending**. Removed **Just Chatting** (`desk-only`) and all custom/`Add Scene` paths. Persistence (`maka.stream.scenes.v1`) keeps `activeSceneId` + layers; legacy custom scenes / non-canonical ids are ignored and cleared on write (falls back to Gameplay).
2. **Download CTA** — `#btn-add-scene-alt` / Add Scene removed. Replaced with `#btn-scenes-download` → `/download.html` (“Download the exe for the full experience”).
3. **Immediate scene switch** — Scene row click calls `selectScene` → updates active state, program scene-name overlay, Maka bumper card (Starting Soon / Intermission / Ending), and emits `maka:scene-change`. No “Scene options (desktop app)” context menu / dialog. Scene ⋯ menus are static (non-interactive). Preview no longer binds parallel `[data-scene]` clicks.
4. **Branded bumpers** — Overlay card shows **MAKA** brand line + mark + scene title/subtitle (`Maka is warming up…` / `Be right back…` / `Thanks for watching with Maka…`).

**Click-test:** open `/stream/` → confirm four scenes + download link (no Add Scene) → click Starting Soon → bumper appears, no modal → click Gameplay → bumper hides, scene name “Gameplay” → Ending / Intermission swap branded copy.

---

## Sequential fix layer 2 — live flash

**Done** (this pass only; no deploy). Scope: program live-output indicator flash only. Sources pickers, audio, and browser-tab copy unchanged.

1. **Wire** — `live.js` `setLiveUi(isLive)` (from Go Live / WHIP / `updateButtons`) calls `syncProgramLiveChrome`, toggling `.is-live` on `#program`, `.preview-stage`, `.program-label` / `.preview-stage__label`, `.preview-stage__scene-name`, and `#stream-live-pill`.
2. **CSS** — When `.is-live` is present, “• Live Output” (and scene pill / LIVE pill) use a subtle gold opacity blink (`program-live-flash` / `stream-live-pill-flash`). Offline / not live: class absent, static (no animation). Honors `prefers-reduced-motion`.
3. **Verify** — Headless: class absent when `MakaLive.isLive() === false`; present on program label + live pill after `MakaLive._setLiveUi(true)`; cleared after `_setLiveUi(false)`.

---

## Sequential fix layer 3 — browser-tab copy

**Done** (this pass only; no deploy). Scope: user-facing labels/hints/docs only. Sources device pickers and audio meters unchanged. `getDisplayMedia` still prefers tab/window (`displaySurface: 'browser'`).

1. **No brand sponsorship** — Removed “Share GeForce Now tab” / GeForce Now / NVIDIA pitch from `site/stream/` UI copy. Button + empty state + capture hint now say **Share browser tab / window** (and equivalent “browser tab or window” wording).
2. **Files** — `site/stream/index.html`, `js/preview.js` (labels/titles/hints/comments), `js/live.js` (relay-missing modal), `css/preview-stage.css` (comment). Docs: `docs/web-studio-cloud-streaming.md` capture path + workflow + capability table use generic browser-tab / cloud-gaming language (no NVIDIA sponsorship claim).
3. **Verify** — `rg -i 'geforce|nvidia' site/stream` → no matches. Product may still mention cloud gaming generically.

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
