# Studio wiring audit

Living checklist of renderer ↔ relay ↔ capture wiring for the studio redesign shell.

## Scenes + Program

| Area | DOM / handlers | Status |
|------|----------------|--------|
| Built-in scene rows | `#scene-gameplay` … `#scene-ending`, `data-scene`, `selectScene()` | **OK** |
| Active highlight | `.studio-list-item[data-scene]`, `highlightSceneSelection()` | **OK** |
| Custom scenes | `#btn-add-scene`, `#btn-add-scene-alt`, `#studio-add-scene-row`, `renderCustomSceneRows()` | **OK** — max 3, rename on blur, scroll via `.studio-list--scenes` |
| Per-scene ⋯ menu | `[data-scene-menu]`; `#scene-image-menu-dialog` | **OK** — Gameplay uses static `studio-list-menu--static` |
| Scene image IPC | `pickSceneImageFile` / `readSceneImageDataUrl` | **OK** (`scene:pick-image`, `main/scene-image-io.ts`) |
| Mask modes | `shared/scene-images.ts` | **OK** — desk-only + custom → `game-mask-only`; starting-soon / intermission / ending → `full-mask-except-chat`; gameplay → no upload |
| Program monitor | `#program-video`, `#program-cam`, `#program-chat-slot`, `#program-notifications-slot`, `#program-scene-bg` | **OK** — `syncSceneProgramPresentation()` + `applyProgramPreviewLayout()` |
| Overlay presets | `selectOverlayPreset()`, `OVERLAY_LAYOUT_PRESETS` | **OK** — `buildOutgoingSceneLayout()` + `pushSceneLayout()` when live |

**Broken → fixed (scenes pass)**

1. **Scene switch left chat/notification slots stale** — `selectScene()` did not call `refreshProgramPreviewLayout()` after leaving a holding card. **Fix:** refresh at end of `selectScene()`.
2. **Holding scene + PNG/JPG hid overlay slots** — stub + image path forced chat/notifications hidden. **Fix:** `refreshProgramPreviewLayout()` + `updateProgramBrowserOverlay()` instead.
3. **Overlay presets ignored on holding scenes** — stub branch skipped preset geometry. **Fix:** merge `chat` / `notifications` / `browser` sources from active preset into stub layout.
4. **Settings hydrate** — loaded `sceneImages` / `customScenes` without refreshing program layout. **Fix:** `refreshProgramPreviewLayout()` in `getSettings()` callback.

**Remaining gaps**

- Active scene not persisted (`activeSceneTemplateId` defaults to `gaming-cam` on launch).
- `selectScene()` clears `activeOverlayPresetId` (always “follow scene layout” after picking a scene).
- Chat / notifications slots are layout placeholders only (no live feed).
- Full-mask scene images are full-frame assets; chat regions are separate compositor sources (no punched mask in the image file).

## Stream controls

| Control | Status | Wiring |
| --- | --- | --- |
| Sidebar **Go Live** | **OK** | Opens `#go-live-wizard-dialog` (`go-live-wizard.ts`). While live, ends session via `endLive()` (no wizard). |
| Wizard — keys prefill | **OK** | `readUi()` from `#twitch-key` / `#youtube-key` + `streamDestinations` on disk; wizard fields set on `open()`. |
| Wizard — quality | **OK** | `#go-live-wizard-quality` ↔ `#program-quality-select` via `syncEncodeProfileSelects` / `bitrateProfile`. |
| Wizard — platform default | **OK** | `lastStreamPlatform` (+ fresh `getSettings` before open). |
| Top bar **Go Live** | **OK** | Direct `onGoLiveClick()` (F8 / Ctrl+L). |
| **Start Recording** | **OK** | `program-recording.ts` + `encodeProfileSpec(selectedProfile())`. |
| `#stat-recording` | **OK** | “Not recording” / “Now recording” via `setRecordingUi`. |
| Auto-save folder | **OK** | `recordingSaveFolder` → `recording:save` when folder exists; Shift+stop forces dialog. Renderer cache via `onRecordingFolderChange`. |
| Virtual camera | **Partial (preview)** | `#btn-start-vcam` toggles `program-virtual-camera.ts` (shared `program-output-compositor.ts` with recording). `#stat-vcam` + button `data-vcam` when active. `vcam:get-capability` in main (`virtual-camera.ts`): no bundled driver — **preview-only** on all platforms; Windows dialog lists OBS Virtual Camera fallback + **Copy program frame**. Stops on `app:prepare-quit`. Shift+click opens `#vcam-unavailable-dialog` without toggling. |

## Stats bar

| Element | Status | Wiring |
| --- | --- | --- |
| `#program-output-mode` | **OK** | Studio ↔ Browser; `startupMode`; hidden in browse/settings CSS. |
| Metrics (right) | **OK** | Dropped / FPS / latency / Mbps in `updateProgramStats`. Dropped: relay `droppedFrames` when set, else WHIP `outbound-rtp` `framesDropped` while live. Latency: relay `latencyMs` when set, else WHIP RTT (`parseWhipStreamMetrics` via `startWhipStatsSampler`). Mbps: relay `bitrateMbps` when live, else encode target. |
| Stream info viewers | **Partial** | `#stream-viewers`: `Offline` when not live; live shows relay `viewerCount` / `viewers` or per-platform `platforms.*.viewers` when TabcastRelay reports them; otherwise `Viewers: —` (no fabricated counts). |
| Twitch / YouTube chips | **OK** | Open `#platform-key-dialog`; persist `streamDestinations`. |
| `#program-quality-select` | **OK** | Only encode dropdown in layout; default option in HTML; no stray `#profile-select`. |
| Encode persistence | **OK** | Stats bar, wizard, Settings → Streaming share `bitrateProfile`. |

## Settings (`body[data-mode='settings']`)

| Area | Status | Wiring |
| --- | --- | --- |
| Shell / chrome hidden | **OK** | `applyMode` + `app.css` hides studio columns and browse chrome. |
| Tab fields load/save | **OK** | `settings-view.ts` + `settings.json` (see `docs/studio-settings-inventory.md`). |
| Active tab memory | **OK** | `settingsActiveTab` persisted and restored on open. |
| Encode from Settings | **OK** | Syncs stats bar, stream info, `pushSceneLayout`. |
| Recording folder copy | **OK** | Documents auto-save + Shift+stop override. |

**Partial (intentional):** audio bitrates, video encoder/GPU — stored; not fully consumed by relay/mixer yet.

## Browser (`body[data-mode='browse']`)

| Behavior | Status | Wiring |
| --- | --- | --- |
| Hide studio chrome | **OK** | Sidebars, program, stats bar `display: none`. |
| Slim top bar | **OK** | Hides relay, settings, go live; shows “Browser Mode”. |
| Tabs + stage | **OK** | `browse-session.json`, `#stage-frame`. |

## Marketplace

| Surface | Status | Wiring |
| --- | --- | --- |
| Studio entry | **OK** | `#btn-open-marketplace` in right sidebar opens `#marketplace-dialog` (`showModal`). |
| Modal catalog | **OK** | Scrollable `#marketplace-list`; install/enable/uninstall via `marketplace.ts` → `paintList`. |
| Modal refresh / close | **OK** | `#marketplace-refresh`, `#marketplace-close` in dialog footer. |
| `npm run verify:addons` | **OK** | CI gate; `docs/addon-validation-report.md`. |

## Audio + Stream Audio

| Item | Status | Notes |
|------|--------|-------|
| Mic level meter | **OK** | `startAudioLevelMeter` on live `micStream` after `applyMic()`; resets to 0% on stop (`audio-level-meter.ts`, `app.ts`). |
| Desktop / game meters (Windows) | **OK** | WASAPI loopback + per-source desktop audio via `system-audio-capture.ts`; meters from capture streams, not placeholders. |
| Desktop / game meters (Linux) | **OK (stub)** | `systemAudioCaptureSupported` false → no capture, meters pinned at 0%, `data-capture-unavailable="1"`. |
| Boot meter values | **OK** | `.audio-meter` default `width: 0%` in CSS; JS sets 0 on stop/init for non-Windows. |
| Mute-by-name (desktop / game) | **OK** | Click `#audio-desktop-label` / `#audio-game-label` toggles stream mute; `track.enabled` + `syncWhipAvTracks()` `replaceTrack(null)` while meters stay live. |
| Mic mute (sources row) | **OK** | `toggleMicMute()` updates track enabled, WHIP mic sender, and studio toggles. |
| Gear: desktop output | **OK** | `#btn-desktop-audio-settings` toggles `#desktop-audio-output`; persists `preferredDesktopAudioOutputDeviceId` and restarts loopback. |
| Gear: game link | **OK** | `#btn-game-audio-settings` refreshes linked capture audio and scrolls to gameplay source when missing. |
| Gear: microphone | **OK** | Mixer ⚙ opens mic source picker (`#audio-mic` → `toggleSourcePicker('mic')`). |
| WHIP split tracks | **OK** | `whip.ts` `attachAudioRole` uses `RELAY_TRACK_STREAM_IDS`: `mic`, `desktop-audio`, `game-audio` (`shared/tabcast.ts`). |
| WHIP mute after publish | **OK** | `syncWhipAvTracks()` runs immediately after `attachWhipPublisher` (go-live + reconnect) so pre-live mixer mute is honored. |
| Local recording mix | **OK** | `program-recording.ts` muxes live enabled mic + desktop + game tracks with canvas video (`liveEnabledAudioTracks`). |
| Settings race (desktop device) | **OK** | `initSystemAudioCapture()` loads `preferredDesktopAudioOutputDeviceId` before first loopback; settings hydrate re-runs refresh when needed. |

**Manual verify (Windows):** boot studio → meters at 0 until capture/mic live → desktop meter moves with system audio → select gameplay → game meter moves → mute channel names → go live → relay receives three audio msids → recording includes audible desktop/game when unmuted.

**Manual verify (Linux):** desktop/game rows dimmed, meters stay 0%, mic meter still follows selected device.

## Sources

| Item | Status | Notes |
|------|--------|-------|
| Row click show/hide | **OK** | Game Capture, Webcam, Overlay, Chat, Notifications use `toggleLayerForSourceKind` (dim via `data-enabled="0"`). Microphone row uses `toggleMicLayer` (capture on/off, not a program video layer). |
| ⋯ cascade picker | **OK** | `onSourceMenuActivate` → `toggleSourcePicker`; row click ignores `[data-source-menu]`. All rows use horizontal ellipsis, not down arrows. |
| One picker open | **Fixed** | `toggleSourcePicker` clears `expandedSourceKinds` before opening another (or closes on repeat ⋯). |
| Sidebar width | **Fixed** | `.studio-source-list` / `.studio-source-picker` use `min-width: 0`, `overflow-x: clip`, and ellipsized labels so cascades stay inside 252px. |
| Game Capture ⋯ | **OK** | `listCaptureSources()` displays/windows only (`refreshSourcePicker('game')`). Pick calls `selectDesktopSource` (now forces `layerEnabled.game = true`). |
| Overlay ⋯ | **OK** | Layout presets from `OVERLAY_LAYOUT_PRESETS` (`overlay-layout-presets.ts`) via `selectOverlayPreset` → `pushSceneLayout`. Search tabs are a separate picker section (`listTabs`, `startBrowserCapture`). |
| Webcam ⋯ | **OK** | Device list mirrors hidden `#camera-select` after `refreshAvDevices()`; pick runs `applyCamera` + `syncLayerTracks`. |
| Microphone ⋯ | **OK** | Device list from `#mic-select`; mixer gear scrolls to mic row and opens mic picker. |
| Chat ⋯ | **OK** | Off / placeholder / pinned popouts / chat-like Search tabs; `syncChatSourceRow` label; `#program-chat-slot` from `applyProgramPreviewLayout`. |
| Notifications ⋯ | **OK** | Off vs placeholder; `#program-notifications-slot` from layout or `defaultNotificationsOverlaySlot`. |
| Overlay preset → slots | **Fixed** | `selectOverlayPreset` and “Follow scene layout” call `syncLayerTracks()` so chat/notifications enable flags and program placeholders update immediately. |
| Search capture ended | **Fixed** | `stopBrowserCapture` sets `layerEnabled.browser = false` when the tab capture ends so Overlay row state matches reality. |
| Legacy dropdowns | **OK** | `#camera-select`, `#mic-select`, `#source-list` live in `.studio-legacy-host` (off-screen). |
| Refresh ↻ | **OK** | `#btn-refresh-sources` → `refreshSources()` re-fills open pickers. |

**Broken → fixed (`cursor/wiring-audit-sources-dc6d`):** (1) multiple cascades could stay open — `toggleSourcePicker` now closes others; (2) overlay preset / “Follow scene layout” skipped `syncLayerTracks()` — chat/notification rows and program slots lagged; (3) `selectDesktopSource` did not re-enable gameplay layer; (4) `stopBrowserCapture` left `layerEnabled.browser` true after tab capture ended; (5) long picker labels could widen the sidebar — CSS `min-width: 0` / `overflow-x: clip` on source list and picker rows.

**Manual verify:** Open Sources → click each row (except mic) and confirm program layer toggles + row dimming. Click ⋯ on two rows and confirm only one cascade is open and the sidebar width stays fixed. Game ⋯ lists displays/windows; Overlay ⋯ lists composition presets then Search tabs. Enable Chat/Notifications or pick an overlay preset and confirm gold placeholder regions on the program monitor. Pick a game source with gameplay hidden and confirm the layer turns on. End Search tab capture and confirm Overlay row deactivates.

## Fixes on `cursor/wiring-audit-controls-dc6d`

1. `settingsActiveTab` persistence (was session-only DOM).
2. Recording folder picked in Settings updates renderer cache without restart.
3. Settings encode profile change pushes scene layout + stream info meta.
4. Go Live wizard honors `lastStreamPlatform` on open.
5. Recording settings hint matches auto-save behavior.

## Intentional stubs (unchanged)

- Virtual camera **device** output not bundled (preview compositor + OBS fallback UX only).
- Stream Info viewer count when relay does not expose platform APIs (UI shows `Viewers: —` while live).
- Marketplace modal kept but not promoted in sidebar.
- Linux desktop/game capture unavailable (meters stub).
- Stream title/category API placeholders on Stream Info card.

## Verification

```bash
npm run typecheck
npm run verify:addons
```
