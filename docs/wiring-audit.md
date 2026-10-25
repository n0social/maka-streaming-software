# Studio wiring audit

Living checklist of renderer ↔ relay ↔ capture wiring. Other sections are filled in by parallel audit passes.

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
