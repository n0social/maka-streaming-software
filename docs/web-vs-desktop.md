# Maka web studio vs Electron desktop

Direct comparison between the **Electron streaming studio** (`src/renderer/*`) and the **browser studio** at [makalive.stream/stream/](https://makalive.stream/stream/). Visual grid reference: [makalive.stream/preview/](https://makalive.stream/preview/) (non-functional mock, closer to desktop chrome).

**Staging relay (production site):** [https://makalive.stream/relay/health](https://makalive.stream/relay/health) — same HTTP contract as local `MAKA.relay` on port `38473`.

## Reference files

| Area | Desktop (Electron) | Web (`/stream/`) | Notes |
| --- | --- | --- | --- |
| Shell / layout | `src/renderer/app.html`, `app.css` | `site/stream/index.html`, `site/stream/stream.css` | Web grid mirrors desktop (scenes/sources left, program + stats center, mixer/controls/info right). Window chrome is desktop-only and is not on the web page |
| App logic | `src/renderer/app.ts` | `site/stream/stream.js` | Web is a single IIFE; no Tabcast IPC |
| Relay HTTP | `src/renderer/relay-client.ts` | `stream.js` (`relayFetch`, config/scene/stop) | Shared contract in `src/shared/tabcast.ts` |
| WHIP publish | `src/renderer/whip.ts` | `stream.js` (`publishWhip`) | Desktop prefers H.264; web mirrors in wire pass 1 |
| Shared constants | `src/shared/tabcast.ts`, `stream-encode-profiles.ts` | Duplicated profile map in `stream.js` (no bundler on static site) |
| Visual mock | — | `site/preview/index.html`, `preview.css` | Scenes, mixer, Search tab — layout only |

---

## UI regions

| Region | Desktop | Web `/stream/` | Parity |
| --- | --- | --- | --- |
| Top bar (brand, version) | Maka wordmark, “Streaming studio”, app version | Maka wordmark, “Streaming studio”, Web version chip | ⚠️ partial (web chip, not semver from binary) |
| Mode tabs | Stream + Search (browse) | Stream active; Search tab disabled stub | ⚠️ partial (no browse webview) |
| Relay chip | Lifecycle + label (`relay-chip`) | Same chip pattern + WHIP health text | ⚠️ partial (no start/stop relay process) |
| Go Live (header) | Primary `Go Live` / `End Live` | Header + sidebar Start/End streaming | ✅ parity (web) |
| Window controls | Min / max / close | Not present | ❌ desktop-only |
| Browse tab strip | Twitch, YT, chat pins | — | ❌ missing |
| URL / nav row | Back, forward, reload, omnibox | — | ❌ missing |
| Scene list | Multiple scenes, switch layout | Default scene names + add scene, saved in localStorage; active name is the program label and is sent on `POST /scene` | ⚠️ partial (no per-scene source layouts) |
| Sources list | Game capture, webcam, mic, overlay | Game Capture (`getDisplayMedia`), webcam, mic; click again stops the track. Overlay is an image file drawn on the program canvas | ⚠️ partial (no OS game-capture API; canvas compositor) |
| Program monitor | Game + browser overlay + PIP | White stage. Capture is letterboxed on white; webcam is the program or a gold PIP when both are on | ⚠️ partial (no browser-page overlay track) |
| Program stats bar | Studio mode, dropped, FPS, resolution | Offline: zeros and the selected encode profile size. Live: video-track resolution, RTC FPS / dropped frames / RTT when the stats report them | ⚠️ partial (no relay-side encoder stats) |
| Audio mixer | Desktop / mic / game meters | Desktop Audio (display/tab audio) and Microphone faders only. Meters follow those tracks and sit at silence when the track is absent. Game Audio is not on the web page | ⚠️ partial (no game-audio device) |
| Stream controls sidebar | Go live, recording, vcam | Go Live / End Live (WHIP) and Start/Stop Recording (WebM). Virtual camera is not on the web page | ⚠️ partial (vcam is desktop-only) |
| Stream info / destinations | Twitch / YT / custom RTMP toggles | Stream info card + destinations + encode in right column | ✅ parity (web sidebar) |
| Encode profile | `profile-select` + center quality dropdown | `cfg-profile` in stream info block | ✅ parity (presets match `ENCODE_PROFILES`) |
| Settings dialog | Tray, chat, lab mode, startup, addons | — | ❌ missing |
| Relay modal / errors | `relay-error`, `dest-error`, settings | Log panel + relay modal | ⚠️ partial (wire pass 1 adds error banner) |
| Addons marketplace | Settings → addons | — | ❌ missing |
| Phone cam addon | Pairing, tracks | — | ❌ missing |
| Update banner | In-app updates | — | ❌ N/A |

---

## Behavior

| Behavior | Desktop | Web | Parity |
| --- | --- | --- | --- |
| Relay health probe | Tabcast / `pingRelayHealth` → `GET /health` | `probeRelay()` on load + refresh button | ✅ |
| Auth on protected routes | `Authorization: Bearer {relayToken}` | Same in `authHeaders()` | ✅ |
| `POST /config` | Profile + `bitrateMbps` + keys (+ custom RTMP) | Profile + `bitrateMbps` + enabled destination keys (matches `relay-client.ts`) | ✅ |
| `POST /config/verify` | With destination toggles | Apply config, then verify (destination toggles) | ✅ |
| `POST /scene` | Profile-sized canvas + gameplay/webcam/browser | Profile canvas + `name` and gameplay `label` set to the active scene; switch/add re-POSTs when the relay is up | ⚠️ partial (same capture layout per scene) |
| WHIP publish | Named streams, H.264 preference, ICE gather | Named streams, H.264 preference. Mic id carries the mixed desktop + microphone bus after the faders | ⚠️ partial (no separate browser track) |
| WHIP teardown | `DELETE` Location + `POST /stop` | Same | ✅ |
| Status poll | Tabcast snapshot + UI stats | 2s poll `GET /status` | ⚠️ partial (no dropped/FPS from relay in UI) |
| Orphan / relay restart detection | `relayNeedsLiveBootstrap`, live recovery | Wire pass: log + banner when WHIP session lost while live | ⚠️ partial |
| Start relay process | User / auto via Tabcast | Expects relay already running (local or `/relay/` proxy) | ⚠️ partial |
| Browse tabs / embedded browser | Full Chromium webview | — | ❌ |
| Addons hooks (`live.start` / `live.end`) | Yes | — | ❌ |
| Phone camera | WebRTC addon path | — | ❌ |
| Key validation before go-live | `validateRelayStreamKeys` | Same validation on Start stream (debug pass) | ✅ |
| Demo / lab mode | Settings checkbox | — | ❌ |

---

## Fonts and CSS

| Item | Desktop | Web | Parity |
| --- | --- | --- | --- |
| Inter (UI body) | Google Fonts + `app.css` | Google Fonts + `stream.css` | ✅ |
| League Spartan (wordmark, headings, primary buttons) | Yes | Yes | ✅ |
| Marketing `maka.css` | Not loaded in app window | Not loaded on `/stream/` (by design) | ✅ |
| Preview mock | Loads `maka.css` + mascot | `/stream/` has no mascot/hero | ✅ |
| Cream / gold tokens | `--bg`, `--gold`, program black stage | Same token set in `stream.css`. Web program stage is white (`#ffffff`), including letterbox | ⚠️ partial (desktop stage stays black) |
| Center stats / mixer styling | Full `app.css` | Program stats under the monitor + Desktop/Mic faders (stream9e0) | ⚠️ partial (meters are post-fader Web Audio levels) |

---

## Relay base URL resolution

| Context | Base URL |
| --- | --- |
| Desktop | `http://127.0.0.1:38473` (`RELAY_BASE_URL` in `tabcast.ts`) |
| Web on makalive.stream | `{origin}/relay` (nginx → staging mock relay) |
| Web local dev | `http://127.0.0.1:38473` or `?relay=` override |
| CSP `connect-src` | Web allows `'self'`, localhost relay; explicit `https://makalive.stream` for www/origin edge cases |

---

## Go-live sequence (target parity)

Both clients aim for this order:

1. `GET /health` → store `relayToken`
2. `POST /config` (profile, bitrate, keys)
3. `POST /scene` (optional; non-fatal if relay accepts WHIP-only)
4. `POST /whip` with gathered SDP (+ Bearer where required)
5. Poll `GET /status` until `live` or surface `error`
6. Stop: WHIP `DELETE` + `POST /stop`

Desktop additionally runs relay lifecycle via Tabcast, live recovery, and WHIP video stall watchdog (`whip.ts`).

---

## Wired pass (stream9e0)

The frozen mock, including the hero program image, is `MAKA_template/`. It is not a release. `/stream/` is the functional page.

These controls are desktop-only and are **not** on the web studio (no disabled stand-in):

- Virtual camera (a browser cannot install an OS virtual camera)
- Help, minimize, maximize, and close (they cannot control the browser window)
- Viewer count (the relay has no viewer field)
- Game Audio as its own mixer channel (`getDisplayMedia` does not provide a separate game-audio device; it is not aliased to desktop gain)
- Per-channel mixer gear menus and the Sources “+” (they had no browser action)
- Source row ••• menus (the row itself starts and stops that source)

| Control | Web `/stream/` | Still desktop-only |
| --- | --- | --- |
| Scenes | Select a scene or add one (header + and Add Scene). The program label is the active scene name. The list is stored in `localStorage`. Rename and Delete are on each scene ••• menu; the last scene cannot be deleted. When the relay is up, the active name is posted on `POST /scene`. | Per-scene source layouts, scene templates |
| Game Capture | `getDisplayMedia` (screen, window, or tab, plus shared audio when the browser provides it). Click again to stop the tracks. | OS game-capture / process capture |
| Webcam | `getUserMedia` video. Shown as the program, or as a PIP when a display capture is also on. Click again to stop. | Device picker beyond the browser prompt |
| Microphone | `getUserMedia` audio. Drives the microphone meter. Click again to stop. | ASIO / exclusive-mode devices |
| Overlay | Image file picker. The image is drawn on the program canvas. Click again to remove it. | Browser-source / URL overlay and the desktop browser track |
| Audio mixer | Desktop Audio and Microphone only. Fader 100 is unity gain (0 dB), the default. The desktop meter follows the display-capture audio track and is silent when that track is absent. The mic meter moves only while the microphone track is live. | Game Audio device, monitoring, per-channel device pickers |
| Go Live | WHIP publish (`/relay/whip`, health, config, scene, stop). The button reads Go Live or End Live. Duration counts only while the peer connection is `connected`, and clears on End Live. | Starting the relay process, multi-platform encode inside the app |
| Start Recording | `MediaRecorder` on the program canvas (and the mixed audio bus when a track exists). Requires a video source. Stop downloads a WebM. | Local recording path, remux, replay buffer |
| Virtual camera | Not present. | OS virtual camera |
| Stream info | Title and category are editable, length-limited, and saved in `localStorage`. There is no viewer readout. | Platform metadata sync, real viewer counts |
| Stats | Offline: dropped frames 0, FPS 0, 0 ms, and the selected encode profile resolution. Live numbers come from the video track and `getStats()` only. | Encoder process stats from the desktop relay UI |
| Settings gear | Opens destinations, encode profile, and the relay log. Those values are what Go Live sends. The footer says “All systems nominal” only after relay health succeeds, and a warning when health or publish fails. | Tray, chat, lab mode, startup, addons, help, window chrome |
| Help, minimize, maximize, close | Not present. | Real window chrome |

Cache buster: `stream9e0`.

## UI pass (stream9d5)

Historical layout notes. stream9e0 removed the browser-impossible controls listed above (help, window chrome, virtual camera, viewers, Game Audio).

- **`/stream/`** follows `docs/readme-hero.png`, not the earlier web chrome: title bar is the Maka Studio lockup, centered window title, help, settings gear, and decorative window controls.
- **Scenes / sources** are cream rows with line icons and a ••• menu. Gameplay is the gold selected row. Add Scene sits under the list. “All systems nominal” is the left-column footer.
- **Program** in stream9d5 showed the mock frame until capture replaced it. stream9d6 removes that poster from `/stream/` (it remains only in `MAKA_template/`). The scene name and “• Live Output” sit above the monitor. Stats under the program read Studio Mode, Dropped Frames, FPS, latency, and resolution.
- **Right column** is three cards: segmented horizontal mixer (Desktop Audio, Microphone, Game Audio) with a −30…0 dB scale, gold Go Live plus recording / virtual camera stubs, and the stream info card (thumbnail, title, category, red Live, viewers, duration).
- **Destinations, encode profile, relay status, and the log** stay in the settings gear so they are not painted onto the mock. Go Live still runs the WHIP path.
- Cache buster: `stream9d5`. `/stream/` HTML, CSS, and JS stay `Cache-Control: no-cache`.

---

## Debug pass (stream9c3)

- **Go-live:** `onStart` now runs `validateRelayStreamKeys` before `POST /config` (matches desktop `goLive()`).
- **Scene layout:** Webcam PIP in `POST /scene` only when screen + webcam are both active (matches WHIP `webcam` track and desktop `defaultSceneLayout`).
- **Custom RTMP:** Stricter URL/key checks aligned with `src/shared/stream-keys.ts` (both fields required when either is filled).
- **Mock relay:** Default profile bitrates in `web-relay-dev.mjs` match `stream-encode-profiles.ts`.
- **Smoke test:** Skips spawning dev relay when port 38473 is already up; covers `POST /scene` and `POST /stop`.

---

## Pass 3 (planned — not in pass 2)

| Item | Desktop | Web target |
| --- | --- | --- |
| Browse / Search tab | Full browser webview + WHIP browser track | Tab strip + embedded browse surface |
| Audio mixer meters | Desktop / mic / game VU | Footer or left-column meters from capture analyser |
| Full live recovery watchdog | `relayNeedsLiveBootstrap`, WHIP stall retry | Auto re-POST config/scene/WHIP when relay drops session mid-live |

---

## Live links

- Browser studio: https://makalive.stream/stream/
- Staging relay health: https://makalive.stream/relay/health
- Studio visual mock: https://makalive.stream/preview/
- Web relay dev docs: [web-relay.md](./web-relay.md)
