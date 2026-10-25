# Studio settings inventory

Audit of persisted settings, settings UI, and related controls in the Maka Electron studio (`settings.json`, browse session, and in-app surfaces). Last reviewed for the cream/gold redesign branch.

## Settings dialog (`#settings-dialog`)

| Label (UI) | Key / control id | Storage key | Wired? | What it does |
| --- | --- | --- | --- | --- |
| Minimize to tray while live | `set-tray-live` | `minimizeToTrayWhileLive` | **Yes** | On window close while streaming, main process minimizes to tray instead of quitting when this is true (`maybeMinimizeToTray` in `src/main/index.ts`). Default: `true`. |
| Open chat pop-out when entering Browser Mode | `set-open-chat` | `openChatOnBrowse` | **Yes** | When switching to Browser Mode, main opens the chat pop-out if enabled (`openChatOnBrowse` in `src/main/index.ts`). Default: `false`. |
| Demo mode (skip key validation) | `set-lab-mode` | `labMode` | **Yes** | Skips stream-key format checks in the renderer go-live path; updates `#dest-hint` copy. Default: `false`. |
| Startup mode | `set-startup` | `startupMode` | **Yes** | `studio` vs `browse` on launch and when changed from `#program-output-mode`. Default: `studio`. |
| Replay setup wizard | `btn-replay-setup` | (action) | **Yes** | Closes settings and runs `SetupWizard` (`setupWizardComplete` is set when finished/skipped). |
| Check for updates | `btn-check-updates` | (action) | **Yes** | Calls `window.tabcast.checkForUpdates()` and drives `#update-banner`. |
| Replay onboarding tour | `btn-replay-tour` | (action) | **Yes** | Closes settings and starts `OnboardingTour` (does not reset `onboardingComplete`). |
| Save / Cancel | `settings-form` submit | — | **Yes** | Save persists the four fields above via `setSettings`; Cancel closes without write. |

Handlers: `src/renderer/app.ts` (`btn-settings`, `settings-form` submit). Persistence: `src/main/settings-store.ts` + IPC `settings:get` / `settings:set`.

## Persisted in `settings.json` but not in Settings dialog

| Key | Default | Wired? | What it does |
| --- | --- | --- | --- |
| `bitrateProfile` | `720p30` | **Yes** | Encode preset for relay/WHIP and local recording; UI: `#program-quality-select`, go-live wizard quality step. Saved on profile change in `app.ts`. |
| `streamDestinations` | Twitch on, YouTube off | **Yes** | `destTwitch`, `destYoutube`, `destCustom`, `twitchKey`, `youtubeKey`. Platform chips + `#platform-key-dialog`; saved from dialog. Keys stored on disk in userData (security-sensitive). |
| `sceneImages` | `{}` | **Yes** | Absolute paths to scene background images per scene id; scene ⋯ menu and `pickSceneImageFile`. |
| `customScenes` | `[]` | **Yes** | Up to three user scenes (`custom-1` … `custom-3`); Add Scene / rename in left sidebar. |
| `onboardingComplete` | `false` | **Yes** | Set when onboarding tour finishes or is skipped; suppresses auto-start tour. |
| `setupWizardComplete` | `false` | **Yes** | Set when first-run setup wizard finishes or is skipped; suppresses auto-start wizard. |

## Browse session (`browse-session.json`)

| Field | Wired? | What it does |
| --- | --- | --- |
| `tabs` | **Yes** | Saved browser tabs (id, title, url, pinned); restored in Browser Mode. |
| `activeTabId` | **Yes** | Last active tab in Browser Mode. |

Not exposed in Settings dialog; managed by browser UI and `src/main/browse-tabs.ts`.

## Studio controls outside Settings (related “preferences”)

| Surface | Persisted? | Wired? | Notes |
| --- | --- | --- | --- |
| `#program-output-mode` | Yes (`startupMode`) | **Yes** | Same as Settings startup mode. |
| `#program-quality-select` | Yes (`bitrateProfile`) | **Yes** | Stats bar encode preset menu. |
| Twitch / YouTube platform chips | Yes (`streamDestinations`) | **Yes** | Opens stream key dialog; not full metadata (title/category). |
| Go Live wizard keys | Partial | **Yes** | Wizard writes keys into relay RAM; saving platform dialog persists to `streamDestinations`. |
| Custom RTMP (legacy host + wizard) | Partial | **Conditional** | Legacy `#dest-custom-block` is hidden; wizard shows Custom RTMP when `com.tabcast.custom-rtmp` addon is installed/enabled. |
| Scene / source toggles, overlay layout | No (session) | **Yes** | Runtime program layout; not in `settings.json`. |
| Addon Marketplace | No | **Yes** | Right sidebar scroll list `#marketplace-sidebar-list` (catalog via `listMarketplace`); install/enable affects addon panels and custom RTMP visibility. Optional `#marketplace-dialog` retained for full detail. |

## Cosmetic or placeholder UI

| Control | Notes |
| --- | --- |
| Desktop Audio / Game Audio mixer rows | Meters fixed at 0%; gear disabled; titles state not implemented. |
| `#stat-latency` | Placeholder dash until latency telemetry exists. |
| Stream Info title / category / viewers | Placeholder copy; not wired to Twitch/YouTube APIs in this build. |
| `#btn-start-vcam` | Opens honest “not bundled” modal; no driver integration. |
| Program `select` in stats bar (if present/disabled) | Legacy/disabled program picker hook. |

## Suggested additions (proposals only)

### Streaming

- Default stream quality on first run (separate from per-session `#program-quality-select` if users want a global default only in Settings).
- Remember last go-live platform (Twitch vs YouTube) in `streamDestinations` or a small wizard preference.
- Optional “End stream confirmation” toggle before stopping live.

### Browser

- Homepage / default URL for new browser tabs.
- Restore previous session tabs on startup (toggle; today session always restores when entering Browser Mode).

### Recording

- Default recording folder and filename pattern (today: save dialog per recording).
- Record audio-only or separate audio track toggle when local record is enabled.

### Privacy

- Clear saved stream keys / reset destinations one-click.
- Opt-out of analytics or diag upload if added later (no telemetry setting in this build).

### Updates

- Auto-check for updates on startup (today: manual **Check for updates** in Settings).
- Release channel (stable vs beta) when multiple feeds exist.

---

**Related docs:** `docs/studio-redesign-handoff.md`, `docs/ADDON-API.md`, `level2.md` (onboarding and persistence notes).
