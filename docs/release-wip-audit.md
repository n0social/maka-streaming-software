# Release WIP audit (studio redesign)

**Storage cleanup (2026-10-25):** Deleted published releases `v0.2.0` (Tabcast Browser 0.2.0) and `v0.2.2` (0.2.2) — the two oldest by publish date. Draft `v0.2.4-redesign-wip` and releases `v0.2.3` / `0.2.3.1-redesign` were left intact.

## Release handoff

| Item | Value |
| --- | --- |
| CI tag | `v0.2.4-redesign-wip` @ `7def600` (triggers `.github/workflows/release.yml` on `v*` tags) |
| Annotated WIP pointer | `0.2.4-redesign-(wip)` @ `dc95a99` (older snapshot; CI tag includes later audit commit `eecf690`) |
| Installer artifact | `Maka-Setup-0.2.4-redesign-wip.exe` |
| Draft release | https://github.com/n0social/maka-streaming-software/releases/tag/untagged-712689142e449c1caeb2 (title: **Studio redesign WIP (0.2.4)**) |
| CI run | https://github.com/n0social/maka-streaming-software/actions/runs/40216704711 |

Tag: `0.2.4-redesign-(wip)` (see git tags).

This pass separates **working** studio controls from **intentionally disabled** placeholders and fixes cases where the UI implied behavior that code did not implement.

## Summary table

| Area | Status | Notes |
| --- | --- | --- |
| Relay start/stop, health chip | **Working** | Top bar + legacy controls |
| Go Live / End Live (WHIP → relay) | **Working** | Requires capture; desk-only can use webcam-only video |
| Stream keys (Twitch/YouTube/custom) | **Working** | Platform chips + `#platform-key-dialog`; keys saved in `settings.json` on Save; relay RAM while live |
| Go Live wizard (sidebar) | **Working** | `#go-live-wizard-dialog`: platform → key → validate (`verifyRelayConfig`) → go live |
| Local recording | **Partial** | `MediaRecorder` + canvas compositor; `recording:save` IPC (save dialog). No PiP/browser/scene-PNG composite yet |
| Encode profile (`#program-quality-select`) | **Working** | Drives relay layout canvas + stats bar Mbps/FPS |
| Scene: Gameplay (`gaming-cam`) | **Working** | Game + cam layers; relay layout from scene template |
| Scene: Just Chatting (`desk-only`) | **Working** | Cam-only layout; optional PNG/JPG masks gameplay layer only (`#program-scene-bg`) |
| Scene: Starting Soon / Intermission / Ending | **Working (preview)** | Branded card or uploaded full-program image; relay gets `scene-image` overlay metadata |
| Scene image uploads | **Working (local preview)** | `scene:pick-image` IPC; settings `sceneImages`; relay/WHIP unchanged until image compositing |
| Overlay layout presets | **Working** | Optional; default is **Follow scene layout** (not forced classic-gaming) |
| Game Capture picker | **Working** | `listCaptureSources` displays/windows |
| Webcam / mic pickers | **Working** | Device list + phone cam options when available |
| Search tab overlay | **Working** | Under Overlay source row |
| Mic level meter | **Working** | Live `AnalyserNode` → horizontal bar |
| Program stats (dropped, FPS, health, bitrate) | **Working** | FPS/bitrate from encode profile; dropped from relay when live |
| Stream info sidebar | **Working (honest)** | Title = enabled destinations; category = encode preset; duration = local live clock |
| Desktop Audio meter/settings | **Disabled** | Meter honest 0%; relay has no WASAPI loopback yet |
| Game Audio meter/settings | **Disabled** | Meter honest 0%; same as desktop |
| Start Recording | **Working (MVP)** | Sidebar toggle; stats bar **Now recording**; WebM via main-process save dialog |
| Start Virtual Camera | **Stub** | Clickable; honest “not available” modal (no driver) |
| Add Scene (+) | **Working** | Up to 3 custom scenes (`custom-1`…`custom-3`); inline rename; Just Chatting layout |
| Stream viewer count | **Disabled** | Shows `Viewers: N/A` while live (no platform API) |
| Chat / notification overlay slots | **Partial** | Sources row toggles + program placeholders; feeds not composited to relay yet |
| Chat / Notifications source rows | **Working** | Toggle layers; chat picker lists placeholder + pinned Twitch/YT + chat-like Search tabs |
| Scene row `⋯` menus | **Working** | Image pick/clear on Just Chatting, custom scenes, and holding scenes; Gameplay static |
| Studio Mode dropdown | **Disabled** | Single program output mode |

## Fixed in this pass

1. **Per-scene PNG/JPG** — Upload via scene `⋯` or sidebar; persisted in `sceneImages`; program preview on `#program-scene-bg`; `SceneLayout.sources` includes `scene-image` with `assetPath` (relay compositing TBD).
2. **Scene templates ignored by default** — `activeOverlayPresetId` no longer defaults to `classic-gaming`; scenes drive relay layout until the user picks an overlay preset. Overlay picker adds **Follow scene layout**.
3. **Stub scenes on relay** — `buildOutgoingSceneLayout` applies stub templates (empty sources) even when an overlay was previously selected; selecting a scene clears the overlay preset.
4. **Desk-only go live** — Webcam-only sessions can publish WHIP without a display/window capture.
5. **Stream info** — Destination summary and encode category update from real UI state; live duration uses a local timer (not fabricated viewers).
6. **Add Scene** — Creates persisted custom scenes (max 3) with `customScenes` + per-id `sceneImages`.
7. **Mic mixer gear** — Opens/focuses the Microphone source picker.
8. **Sources refresh control** — Icon/title corrected (refresh lists, not “add source”).
9. **Stream controls** — Sidebar Go Live opens cream/gold wizard; recording + vcam buttons enabled (vcam = noop modal); stream keys persist from platform dialog.
10. **Stray sidebar dropdown** — Custom RTMP / AV device hooks confined to `.studio-legacy-host`; encode select seeded in HTML.
11. **Program overlays** — Chat + Notifications source rows; webcam/chat/notif slots respect `layerEnabled`; overlay presets auto-enable chat/notif when layout includes slots.
12. **Mixer honesty** — Desktop/Game meters at 0% (no 12% placeholder).

## IPC added (this pass)

| Channel | Purpose |
| --- | --- |
| `recording:save` | Studio → main: `ArrayBuffer` + default filename → `dialog.showSaveDialog` → write WebM/MP4 |

Existing: `settings:set` / `settings:get` now include `streamDestinations` (`destTwitch`, `destYoutube`, `destCustom`, `twitchKey`, `youtubeKey`).

## Verification run

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run verify:offline` | Pass except `relay-binary` (no Windows `TabcastRelay.exe` on Linux CI VM) |
| `npm run build` | Run before tag (Electron bundle) |

Manual smoke on Linux VM: build only; full Electron preview/WHIP not exercised without relay binary and display capture.

## Still intentionally disabled

See `docs/studio-redesign-handoff.md` § Intentionally disabled, plus viewer count and overlay chat/notification feeds.
