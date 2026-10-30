# Maka web studio vs Electron desktop

Direct comparison between the **Electron streaming studio** (`src/renderer/*`) and the **browser studio** at [makalive.stream/stream/](https://makalive.stream/stream/). Visual grid reference: [makalive.stream/preview/](https://makalive.stream/preview/) (non-functional mock, closer to desktop chrome).

**Staging relay (production site):** [https://makalive.stream/relay/health](https://makalive.stream/relay/health) — same HTTP contract as local `MAKA.relay` on port `38473`.

## Reference files

| Area | Desktop (Electron) | Web (`/stream/`) | Notes |
| --- | --- | --- | --- |
| Shell / layout | `src/renderer/app.html`, `app.css` | `site/stream/index.html`, `site/stream/stream.css` | Web uses studio grid; no window controls |
| App logic | `src/renderer/app.ts` | `site/stream/stream.js` | Web is a single IIFE; no Tabcast IPC |
| Relay HTTP | `src/renderer/relay-client.ts` | `stream.js` (`relayFetch`, config/scene/stop) | Shared contract in `src/shared/tabcast.ts` |
| WHIP publish | `src/renderer/whip.ts` | `stream.js` (`publishWhip`) | Desktop prefers H.264; web mirrors in wire pass 1 |
| Shared constants | `src/shared/tabcast.ts`, `stream-encode-profiles.ts` | Duplicated profile map in `stream.js` (no bundler on static site) |
| Visual mock | — | `site/preview/index.html`, `preview.css` | Scenes, mixer, Search tab — layout only |

---

## UI regions

| Region | Desktop | Web `/stream/` | Parity |
| --- | --- | --- | --- |
| Top bar (brand, version) | Maka wordmark, app version | Maka wordmark, “Browser studio” tag | ⚠️ partial (no version chip) |
| Mode tabs | Stream + Search (browse) | Stream tab only (static label) | ❌ missing Search/Browse |
| Relay chip | Lifecycle + label (`relay-chip`) | Status dot + text (`relay-status-*`) | ⚠️ partial (no start/stop relay process) |
| Go Live (header) | Primary `Go Live` / `End Live` | — | ❌ missing (sidebar buttons only on web) |
| Window controls | Min / max / close | — | ❌ N/A (web) |
| Browse tab strip | Twitch, YT, chat pins | — | ❌ missing |
| URL / nav row | Back, forward, reload, omnibox | — | ❌ missing |
| Scene list | Multiple scenes, switch layout | Scenes column — Scene 1 + add scene; switch re-POSTs `/scene` at profile canvas size | ⚠️ partial (no per-scene source layouts) |
| Sources list | Game capture, webcam, mic, layers | Add webcam / screen / mic buttons | ⚠️ partial (no game capture API; canvas compositor instead) |
| Program monitor | Game + browser overlay + PIP | Canvas preview + gold PIP | ⚠️ partial (no browser overlay track) |
| Program stats bar | Quality select, dropped, FPS, resolution | Footer hint line only | ⚠️ partial |
| Audio mixer | Desktop / mic / game meters | — | ❌ missing |
| Stream controls sidebar | Go live, recording, vcam (stubs) | Start / stop + relay config block | ⚠️ partial |
| Stream info / destinations | Twitch / YT / custom RTMP toggles | Twitch / YT / Custom RTMP toggles + key fields + verify | ✅ parity (web sidebar) |
| Encode profile | `profile-select` + center quality dropdown | `cfg-profile` select | ✅ parity (presets match `ENCODE_PROFILES`) |
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
| `POST /scene` | Profile-sized canvas + gameplay/webcam/browser | Profile canvas + active scene label; switch/add re-POSTs layout | ⚠️ partial (same capture layout per scene) |
| WHIP publish | Named streams, H.264 preference, ICE gather | Named streams, H.264 in wire pass | ⚠️ partial (no browser/desktop-audio tracks) |
| WHIP teardown | `DELETE` Location + `POST /stop` | Same | ✅ |
| Status poll | Tabcast snapshot + UI stats | 2s poll `GET /status` | ⚠️ partial (no dropped/FPS from relay in UI) |
| Orphan / relay restart detection | `relayNeedsLiveBootstrap`, live recovery | Wire pass: log + banner when WHIP session lost while live | ⚠️ partial |
| Start relay process | User / auto via Tabcast | Expects relay already running (local or `/relay/` proxy) | ⚠️ partial |
| Browse tabs / embedded browser | Full Chromium webview | — | ❌ |
| Addons hooks (`live.start` / `live.end`) | Yes | — | ❌ |
| Phone camera | WebRTC addon path | — | ❌ |
| Key validation before go-live | `validateRelayStreamKeys` | Optional keys only (no required destination) | ⚠️ partial |
| Demo / lab mode | Settings checkbox | — | ❌ |

---

## Fonts and CSS

| Item | Desktop | Web | Parity |
| --- | --- | --- | --- |
| Inter (UI body) | Google Fonts + `app.css` | Google Fonts + `stream.css` | ✅ |
| League Spartan (wordmark, headings, primary buttons) | Yes | Yes | ✅ |
| Marketing `maka.css` | Not loaded in app window | Not loaded on `/stream/` (by design) | ✅ |
| Preview mock | Loads `maka.css` + mascot | `/stream/` has no mascot/hero | ✅ |
| Cream / gold tokens | `--bg`, `--gold`, program black stage | Same token set in `stream.css` | ✅ |
| Center stats / mixer styling | Full `app.css` | Footer strip only | ⚠️ partial |

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
