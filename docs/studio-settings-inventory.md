# Studio settings inventory

Audit of persisted settings, settings UI, and related controls in the Maka Electron studio (`settings.json`, browse session, and in-app surfaces). Last reviewed for the full-page **Settings mode** (third shell alongside Studio and Browser).

## Settings mode (`body[data-mode='settings']`)

Full-page tabbed settings opened from the top bar **Settings** button (toggle: click again or use **Stream** to return). Replaces the legacy `#settings-dialog` modal.

| Tab | Controls | Storage keys | Wired? | What it does |
| --- | --- | --- | --- | --- |
| **General** | `set-tray-live`, `set-open-chat`, `set-lab-mode`, `set-auto-update` | `minimizeToTrayWhileLive`, `openChatOnBrowse`, `labMode`, `autoCheckUpdatesOnStartup` | **Yes** | Tray minimize while live (`maybeMinimizeToTray`); chat pop-out on Browser Mode; demo key validation; packaged startup update check (`initAutoUpdate` + 12s delay). |
| **General** | Version lines | (read-only) | **Yes** | `app:get-version-info` — `app.getVersion()` + relay health version. |
| **Streaming** | `set-encode-profile` | `bitrateProfile` | **Yes** | Same encode presets as `#program-quality-select`; saved on change. |
| **Streaming** | `set-last-platform` | `lastStreamPlatform` | **Partial** | UI default / mirror; go-live wizard writes `twitch` / `youtube` when platform chosen. |
| **Audio** | `set-mic-device`, `set-mic-bitrate`, `set-desktop-bitrate` | `preferredMicDeviceId`, `audioMicBitrateKbps`, `audioDesktopBitrateKbps` | **Partial** | Mic device applies to studio `mic-select` + capture; bitrates persisted for future relay wiring. |
| **Video / System** | `set-video-encoder`, `set-gpu-pref` | `videoEncoderPreference`, `gpuPreference` | **Partial** | Persisted; GPU list from `system:list-gpu-options` (Windows CIM when available). |
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

## Deprecated

| Surface | Notes |
| --- | --- |
| `#settings-dialog` | Removed; use Settings mode. |

## Cosmetic or placeholder UI

Unchanged from prior inventory (mixer gears, latency placeholder, stream info API placeholders, vcam modal).

---

**Related docs:** `docs/studio-redesign-handoff.md`, `docs/ADDON-API.md`, `level2.md`.
