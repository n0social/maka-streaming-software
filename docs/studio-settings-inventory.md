# Studio settings inventory

Audit of persisted settings, settings UI, and related controls in the Maka Electron studio (`settings.json`, browse session, and in-app surfaces). Last reviewed for the full-page **Settings mode** (third shell alongside Studio and Browser).

## Settings mode (`body[data-mode='settings']`)

Full-page tabbed settings opened from the top bar **Settings** button (toggle: click again or use **Stream** to return). Replaces the legacy `#settings-dialog` modal.

| Tab | Controls | Storage keys | Wired? | What it does |
| --- | --- | --- | --- | --- |
| **General** | `set-tray-live`, `set-open-chat`, `set-lab-mode`, `set-auto-update` | `minimizeToTrayWhileLive`, `openChatOnBrowse`, `labMode`, `autoCheckUpdatesOnStartup` | **Yes** | Tray minimize while live (`maybeMinimizeToTray`); chat pop-out on Browser Mode; demo key validation; packaged startup update check (`initAutoUpdate` + 12s delay). |
| **General** | Version lines | (read-only) | **Yes** | `app:get-version-info` — `app.getVersion()` + relay health version. |
| **Streaming** | `set-encode-profile` | `bitrateProfile` | **Yes** | `buildRelayConfigRequest` → `profile` + `bitrateMbps` on `POST /config`. |
| **Streaming** | `set-last-platform` | `lastStreamPlatform` | **Partial** | UI default / mirror; go-live wizard writes `twitch` / `youtube` when platform chosen. |
| **Streaming** | `set-stream-title`, `set-stream-category` | `streamTitle`, `streamCategory` | **Partial** | Stream Info + Settings; `/config` fields (v0.1.0 relay ignores). |
| **Audio** | `set-mic-device`, `set-mic-bitrate`, `set-desktop-bitrate` | `preferredMicDeviceId`, `audioMicBitrateKbps`, `audioDesktopBitrateKbps` | **Partial** | Mic → capture; bitrates on `/config` (v0.1.0 fixed AAC). |
| **Video / System** | `set-video-encoder`, `set-gpu-pref` | `videoEncoderPreference`, `gpuPreference` | **Partial** | Forwarded on `/config` (v0.1.0 `libx264` only). |
| **Recording** | `set-recording-folder`, `btn-pick-recording-folder` | `recordingSaveFolder` | **Yes** | `recording:pick-folder` IPC; `recording:save` uses folder as save dialog `defaultPath`. |
| **Studio & Browser** | `data-set-startup` buttons | `startupMode` | **Yes** | `studio` vs `browse` on launch; same as `#program-output-mode`. |
| **Help** | `btn-replay-setup`, `btn-check-updates`, `btn-replay-tour` | (actions) | **Yes** | Setup wizard, `checkForUpdates` + banner, onboarding tour (exits settings first). |

Handlers: `src/renderer/settings-view.ts`, `src/renderer/app.ts` (`btn-settings`, `applyMode`). Persistence: `src/main/settings-store.ts` + IPC `settings:get` / `settings:set`.

### Mode switch UX

| Surface | Behavior |
| --- | --- |
| Top bar **Settings** | Enters `settings` shell mode (`app:set-mode`); pressed state via `aria-pressed`. Click again → `app:exit-settings` restores prior studio/browse workspace. |
| Top bar **Stream** | From settings → exit settings and set workspace to Studio (`startupMode: studio`). |
| `#program-output-mode` | Studio ↔ Browser only (not Settings); persists `startupMode`. |
| `Ctrl+B` | Toggles studio ↔ browse (not settings). |

## Persisted in `settings.json` but not in Settings UI

| Key | Default | Wired? | What it does |
| --- | --- | --- | --- |
| `streamDestinations` | Twitch on, YouTube off | **Yes** | Platform chips + key dialog. |
| `sceneImages` | `{}` | **Yes** | Scene background paths. |
| `customScenes` | `[]` | **Yes** | User scenes (max three). |
| `onboardingComplete` | `false` | **Yes** | Suppresses auto tour. |
| `setupWizardComplete` | `false` | **Yes** | Suppresses auto setup wizard. |

## Browse session (`browse-session.json`)

Unchanged — tab list and active tab; not in Settings mode.

## Studio controls outside Settings (related “preferences”)

| Surface | Persisted? | Wired? | Notes |
| --- | --- | --- | --- |
| `#program-output-mode` | Yes (`startupMode`) | **Yes** | Studio vs Browser workspace. |
| `#program-quality-select` | Yes (`bitrateProfile`) | **Yes** | Stats bar; synced with Settings → Streaming. |
| Platform chips / go-live wizard | Partial | **Yes** | Keys and destinations. |
| Stream Info title / category | Yes | **Partial** | Sidebar inputs + relay `/config`. |

## Relay `POST /config` matrix

| Setting | App (`buildRelayConfigRequest`) | TabcastRelay v0.1.0 | Gap |
| --- | --- | --- | --- |
| `bitrateProfile` | `profile`, `bitrateMbps` | `profile` only | Full presets + video bitrate in newer relay |
| `streamTitle` / `streamCategory` | `/config` + UI | Ignored | Platform metadata APIs |
| Audio bitrates | `audioMicBitrateKbps`, `audioDesktopBitrateKbps` | Fixed profile AAC | Per WHIP track |
| Encoder / GPU | `videoEncoderPreference`, `gpuPreference` | Ignored | NVENC/QSV + device pick |
| Custom RTMP | `customRtmpUrl` / `customRtmpKey` | Not in v0.1.0 binary | Custom RTMP relay |
| Stream keys | `twitchKey`, `youtubeKey` | **Yes** | — |

## Deprecated

| Surface | Notes |
| --- | --- |
| `#settings-dialog` | Removed; use Settings mode. |

## Cosmetic or placeholder UI

Mixer gears, latency placeholder, viewer count when relay has no platform API.

---

**Related docs:** `docs/studio-redesign-handoff.md`, `docs/ADDON-API.md`, `level2.md`.
