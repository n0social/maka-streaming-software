# Release WIP audit (studio redesign)

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
| Stream keys (Twitch/YouTube/custom) | **Working** | Platform chips + `#platform-key-dialog`; keys in relay RAM |
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
| Desktop Audio meter/settings | **Disabled** | Relay has no WASAPI loopback yet |
| Game Audio meter/settings | **Disabled** | Same as desktop |
| Start Recording | **Disabled** | No relay record path in this build |
| Start Virtual Camera | **Disabled** | Not implemented |
| Add Scene (+) | **Disabled** | Custom scene editor not implemented |
| Stream viewer count | **Disabled** | Shows `Viewers: N/A` while live (no platform API) |
| Chat / notification overlay slots | **Placeholder** | Layout regions only; labeled in preview |
| Scene row `⋯` menus | **Working** | Image pick/clear on Just Chatting + holding scenes |
| Studio Mode dropdown | **Disabled** | Single program output mode |

## Fixed in this pass

1. **Per-scene PNG/JPG** — Upload via scene `⋯` or sidebar; persisted in `sceneImages`; program preview on `#program-scene-bg`; `SceneLayout.sources` includes `scene-image` with `assetPath` (relay compositing TBD).
2. **Scene templates ignored by default** — `activeOverlayPresetId` no longer defaults to `classic-gaming`; scenes drive relay layout until the user picks an overlay preset. Overlay picker adds **Follow scene layout**.
3. **Stub scenes on relay** — `buildOutgoingSceneLayout` applies stub templates (empty sources) even when an overlay was previously selected; selecting a scene clears the overlay preset.
4. **Desk-only go live** — Webcam-only sessions can publish WHIP without a display/window capture.
5. **Stream info** — Destination summary and encode category update from real UI state; live duration uses a local timer (not fabricated viewers).
6. **Add Scene** — Buttons disabled with explicit tooltip (no console-only noop).
7. **Mic mixer gear** — Opens/focuses the Microphone source picker.
8. **Sources refresh control** — Icon/title corrected (refresh lists, not “add source”).

## Verification run

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run verify:offline` | Pass except `relay-binary` (no Windows `TabcastRelay.exe` on Linux CI VM) |
| `npm run build` | Run before tag (Electron bundle) |

Manual smoke on Linux VM: build only; full Electron preview/WHIP not exercised without relay binary and display capture.

## Still intentionally disabled

See `docs/studio-redesign-handoff.md` § Intentionally disabled, plus Add Scene, viewer count, and overlay chat/notification feeds.
