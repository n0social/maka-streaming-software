# Studio wiring audit

Living checklist of renderer ↔ relay ↔ capture wiring for the studio redesign shell.

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
| Virtual camera | **Stub** | `#vcam-unavailable-dialog` only. |

## Stats bar

| Element | Status | Wiring |
| --- | --- | --- |
| `#program-output-mode` | **OK** | Studio ↔ Browser; `startupMode`; hidden in browse/settings CSS. |
| Metrics (right) | **OK** | Dropped / FPS / latency placeholder / Mbps in `updateProgramStats`. |
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
| Inline sidebar list | **OK** | `#marketplace-sidebar-list` scrollable; refresh `#marketplace-sidebar-refresh`. |
| No “Browse addons” button | **OK** | Catalog inline only in studio sidebar. |
| Modal `#marketplace-dialog` | **Legacy** | Same `paintList`; not linked from sidebar (optional full view). |
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

**Manual verify:** Open Sources → click each row (except mic) and confirm program layer toggles + row dimming. Click ⋯ on two rows and confirm only one cascade is open and the sidebar width stays fixed. Game ⋯ lists displays/windows; Overlay ⋯ lists composition presets then Search tabs. Enable Chat/Notifications or pick an overlay preset and confirm gold placeholder regions on the program monitor. Pick a game source with gameplay hidden and confirm the layer turns on. End Search tab capture and confirm Overlay row deactivates.

## Fixes on `cursor/wiring-audit-controls-dc6d`

1. `settingsActiveTab` persistence (was session-only DOM).
2. Recording folder picked in Settings updates renderer cache without restart.
3. Settings encode profile change pushes scene layout + stream info meta.
4. Go Live wizard honors `lastStreamPlatform` on open.
5. Recording settings hint matches auto-save behavior.

## Intentional stubs (unchanged)

- Virtual camera driver not bundled.
- Stats latency `—`; Stream Info viewer count N/A.
- Marketplace modal kept but not promoted in sidebar.
- Linux desktop/game capture unavailable (meters stub).
- Stream title/category API placeholders on Stream Info card.

## Verification

```bash
npm run typecheck
npm run verify:addons
```
