# Maka web studio vs Electron desktop

Direct comparison between the **Electron streaming studio** (`src/renderer/*`) and the **browser studio** at [makalive.stream/stream/](https://makalive.stream/stream/). Visual grid reference: [makalive.stream/preview/](https://makalive.stream/preview/) (non-functional mock, closer to desktop chrome).

**Staging relay (production site):** [https://makalive.stream/relay/health](https://makalive.stream/relay/health). The process listening on the droplet is `scripts/web-relay-dev.mjs` (`maka-relay-staging.service`, `127.0.0.1:38473`). Its health version is `0.1.0-mock`. That is a WHIP peer, not `MAKArelay.exe`. The desktop encoder is a Windows binary and is not running on the Linux droplet. The web studio reports that health body as a mock and does not say “connected” unless a non-mock health check answers (the exe’s `http://127.0.0.1:38473/health` when the page can reach it).

## Settings and relay pass (stream9e1)

| Control | What the browser does | Not ported |
| --- | --- | --- |
| Desktop Audio | Meter stays at silence until display/tab audio is on the capture. The fader sets that track’s gain. Gear: mute and monitor. Status reads “No desktop audio detected” when the capture has no audio track. | A separate OS “desktop audio” device. The browser only hears audio the user shares with the tab or screen. |
| Microphone | Meter moves only while a live, unmuted mic track exists. Gear lists `enumerateDevices()` inputs after permission and restarts the track on change. Mute and monitor work. | ASIO / exclusive devices, phone-cam input. |
| Game Audio | Removed. The browser cannot see a separate game device. | OS game-audio capture. |
| Output mode | **Studio Mode** keeps the program as the live output. **Browser Mode** is the web stand-in for the exe’s Search (browser) mode: the program is tagged Browser, a URL opens in a new tab, the next Game Capture prefers a browser surface, and `POST /scene` includes a browser source. | The exe’s embedded Chromium webview. The disabled “Program” stats select had no second option. |
| Stream info | Title and category persist in `localStorage` and are sent on `POST /config` and `POST /scene` (`title`, `category`). The log prints them and redacts stream keys to a length. Live/Offline follows the WHIP `connectionState`. Duration runs only while that state is `connected`. No viewer count. | Twitch/YouTube metadata. `RelayConfigRequest` in `src/shared/tabcast.ts` has no title or category, and `MAKArelay.exe` is not called from this page, so those fields are not published to the platforms. The staging mock stores them and, in this repo’s script, can echo them on `GET /status`; the process currently on the droplet is the older mock and does not echo them yet. |
| Settings | Resolution, FPS, video bitrate (Mbps), audio bitrate, Twitch/YouTube/custom RTMP keys, and relay URL. Saved in `localStorage`. Resolution resizes the program canvas immediately. FPS applies the next time Go Live or recording creates `canvas.captureStream`. Video and audio bitrate call `RTCRtpSender.setParameters` on an open WHIP session and set `MediaRecorder` bitrates on the next recording. Relay URL is this site’s `/relay` or `http://127.0.0.1:38473`. | Tray, chat pop-out, demo/lab mode, startup-as-default, addons, virtual camera, record path, keyframe interval (the exe UI has no keyframe control), window min/max/close. |
| Relay status | `GET /health` must succeed. A mock version is labeled `Mock relay v…` and the footer matches. Failure says relay not detected. Go Live publishes WHIP to that same base. | Replacing the droplet mock with `MAKArelay.exe` (Windows-only). |

## Reference files

| Area | Desktop (Electron) | Web (`/stream/`) | Notes |
| --- | --- | --- | --- |
| Shell / layout | `src/renderer/app.html`, `app.css` | `site/stream/index.html`, `site/stream/stream.css` | Web grid mirrors desktop (scenes/sources left, program + stats center, mixer/controls/info right); decorative window controls only |
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
| Window controls | Min / max / close | Decorative only (non-functional) | ⚠️ N/A (web) |
| Browse tab strip | Twitch, YT, chat pins | — | ❌ missing |
| URL / nav row | Back, forward, reload, omnibox | — | ❌ missing |
| Scene list | Five built-ins plus up to three custom scenes. ••• is Choose image / Clear image (not on Gameplay). Custom names are inline. Switching a scene sets game/webcam visibility from the template and clears the overlay preset. Scene images persist in settings. No delete, duplicate, or reorder | Same five names, add (max 3 custom), rename on custom rows, delete any scene except the last. List and active id persist in `localStorage`; corrupt JSON falls back to the five built-ins. Switching updates the program label, the scene’s image or holding card, and which captures are drawn. `POST /scene` sends the scene `name` when the relay is up. Delete is web-only | ⚠️ partial (no drag-reorder; delete is extra) |
| Sources list | Game capture, webcam, mic, overlay layout presets, chat, notifications | Game Capture, webcam, and mic still start and stop their tracks. Overlay is the desktop composition menu (nine presets or follow the scene layout), not an image file | ⚠️ partial (no OS capture, no chat feed) |
| Program monitor | Game + scene image + overlay preset slots + PIP | White stage. Gameplay keeps letterboxed capture and the gold webcam PIP. Other scenes hide the captures the template turns off, without stopping them. Holding scenes draw their card until a PNG/JPG is chosen | ⚠️ partial (no Search-tab browser track) |
| Program stats bar | Studio mode, dropped, FPS, resolution | Offline: zeros and the selected encode profile size. Live: video-track resolution, RTC FPS / dropped frames / RTT when the stats report them | ⚠️ partial (no relay-side encoder stats) |
| Audio mixer | Desktop / mic / game meters | Desktop and microphone only. Faders, mute, and monitor are live. Mic gear picks an input device. No Game Audio row | ⚠️ partial (no OS game-audio device) |
| Stream controls sidebar | Go live, recording, vcam | Go Live / End Live (WHIP), Start/Stop Recording (WebM download). Virtual camera is disabled: desktop app only | ⚠️ partial (vcam is desktop-only) |
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
| `POST /scene` | Profile-sized canvas + gameplay/webcam/browser, empty for holding scenes, scene-image metadata | Profile canvas + `name`. Gameplay still sends the full frame and a webcam PIP when both captures exist. Other scenes send the template or the selected overlay preset (chat and notification slots included). Switching does not republish WHIP | ⚠️ partial (scene image is drawn on the canvas; the relay does not receive the file) |
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
| Center stats / mixer styling | Full `app.css` | Program stats under the monitor + segmented mixer with real faders (stream9d6) | ⚠️ partial (meters are post-fader Web Audio levels) |

---

## Relay base URL resolution

| Context | Base URL |
| --- | --- |
| Desktop | `http://127.0.0.1:38473` (`RELAY_BASE_URL` in `tabcast.ts`) |
| Web on makalive.stream | `{origin}/relay` (nginx → staging mock `web-relay-dev.mjs`). UI says mock when health version contains `mock`. A real `http://127.0.0.1:38473` health check wins when it is not a mock |
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

## Wired pass (stream9d6)

The frozen mock, including the hero program image, is `MAKA_template/`. It is not a release. `/stream/` is the functional page.

| Control | Web `/stream/` | Still desktop-only |
| --- | --- | --- |
| Scenes | Gameplay, Starting Soon, Just Chatting, Intermission, Ending Scene, plus up to three custom scenes (`custom-1` … `custom-3`). Custom names rename in the row. ••• can delete a scene (refused when it is the last one) and, except on Gameplay, choose or clear a PNG/JPG. The list is stored in `localStorage` (`maka.studio.scenes`). A corrupt or empty list falls back to the five built-in scenes. The program label follows the selection. Scene switch does not stop capture or tear down a live WHIP session. `POST /scene` sends the template or overlay preset, plus title, category, and Studio/Browser mode | Drag-reorder, duplicate, and deleting the last scene. Desktop does not delete scenes at all |
| Overlay | The Overlay row toggles a layout preset. ••• lists Follow scene layout plus the nine desktop presets (Classic gaming, Webcam focus, Notifications stack, Chat corner, Balanced triple, Gameplay PiP left, Minimal cam, Broadcast lower third, Symmetric PiP). Presets position gameplay, webcam, and chat/notification placeholders on the program canvas. Choosing a scene clears the preset, matching the exe. Per-scene PNG/JPG (Just Chatting, the three holding scenes, and custom scenes) is stored in `localStorage` and drawn in the exe mask: gameplay-only, or full frame with chat slots left clear | Search-tab browser overlay, real chat and notification feeds, click-through, and opacity. The old single image picker on the Overlay row is gone |
| Game Capture | `getDisplayMedia` (screen, window, or tab, plus shared audio when the browser provides it). Click again to stop the tracks. A scene that hides gameplay leaves the track running. Browser Mode prefers a browser surface | OS game-capture / process capture |
| Webcam | `getUserMedia` video. On Gameplay it is the program, or a gold PIP when a display capture is also on. Just Chatting shows it full frame. Click again to stop the track | Device picker beyond the browser prompt |
| Microphone | `getUserMedia` audio. Drives the microphone meter. Click again to stop. Scene changes do not mute it. The mixer gear lists input devices | ASIO / exclusive-mode devices |
| Audio mixer | Desktop Audio shows “No desktop audio detected” until shared audio exists. Gear: mute and monitor. Microphone gear: device list, mute, and monitor. Faders set Web Audio gain. No Game Audio channel | Separate game-audio device |
| Go Live | Existing WHIP publish to the staging relay (`/relay/whip`, health, config, scene, stop). Button reads Go Live or End Live. End Live closes the peer connection. | Starting the relay process, multi-platform encode inside the app |
| Start Recording | `MediaRecorder` on the program canvas (and the mixed audio bus when a track exists). Stop downloads a WebM. | Local recording path, remux, replay buffer |
| Virtual camera | Not shown. Browsers cannot install an OS virtual camera | OS virtual camera |
| Stream info | Title and category are editable and saved in `localStorage`. Duration runs only while the WHIP session is up. Viewer count is not shown | Platform metadata sync, real viewer counts |
| Stats | Offline: dropped frames 0, FPS 0, 0 ms, and the selected encode profile resolution. Live: resolution from the video track; FPS, dropped frames, and RTT only when `RTCPeerConnection.getStats()` reports them. | Encoder process stats from the desktop relay UI |
| Settings gear | Opens Twitch, YouTube, and custom RTMP, resolution, FPS, video bitrate, audio bitrate, relay URL, Apply, Verify keys, and Check relay. Values are saved locally and sent on Apply and Go Live. WHIP uses the same relay base as the health check | Tray, chat, lab mode, startup, addons |
| Output mode | Studio Mode and Browser Mode dropdown under the program. Browser Mode shows the URL bar and posts a browser source | Embedded Chromium webview |
| Window chrome | Not shown. The page does not draw minimize, maximize, or close | Real window chrome |

Cache buster: `stream9e1` (settings dialog, mixer gears, scene delete, and overlay presets in one deploy).

## Scenes and overlay (included in stream9e1)

Ported from the desktop studio (`src/renderer/app.ts` on the v0.2.6 line, `src/shared/scene-templates.ts`, `scene-images.ts`, `custom-scenes.ts`, `overlay-layout-presets.ts`):

- Scene switch applies the template: Gameplay shows game and webcam, Just Chatting and custom scenes show webcam only, and Starting Soon / Intermission / Ending Scene show the branded card until a scene image is set.
- Overlay presets are the nine named compositions. They are not stored per scene; selecting a scene clears the preset, as the exe does.
- Scene PNG/JPG files belong to the scene. Gameplay has no image slot.
- Web adds delete, which the exe scene menu does not have. The last remaining scene cannot be deleted.
- Capture tracks and a live WHIP session stay up across scene changes.

Still desktop-only: Search-tab browser overlay, live chat and notification feeds, phone camera, click-through, and opacity. The exe does not reorder or duplicate scenes.

## UI pass (stream9d5)

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
