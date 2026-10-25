# Studio UX redundancy audit

Scan date: 2026-10-25 (branch `cursor/studio-redesign-continue-dc6d`). Focus: duplicate controls, parallel flows, and overlapping copy—not visual polish.

| Issue | Location | Recommendation | Fixed? |
| --- | --- | --- | --- |
| Stream keys collected in three flows | Setup wizard (`setup-wizard-keys`), Go Live wizard (`go-live-wizard-panel-key`), platform chips + `#platform-key-dialog` (`plat-twitch` / `plat-youtube`) | Single “Destinations” surface: chips open one dialog; wizards only link or pre-fill that store. Drop duplicate key fields from setup wizard or make them read-only mirrors. | No |
| Encode quality in four places | Program stats `#program-quality-select`, Settings → Streaming `#set-encode-profile`, Go Live wizard `#go-live-wizard-quality`, persisted `bitrateProfile` | Keep stats bar as live control; settings as default-on-launch only (label clearly). Remove quality step from Go Live wizard or show read-only summary synced from stats bar. | No |
| Go Live entry points | Top bar `#btn-go-live`, sidebar `#btn-go-live-sidebar` | One primary CTA; sidebar button can mirror state or open the same wizard—avoid divergent handlers. | No |
| App mode switching (studio vs browser) | Top tabs `.tabs[data-tour="modes"]`, program stats `#program-output-mode`, Settings → Workspace startup buttons `[data-set-startup]` | Prefer top tabs for runtime mode; demote or remove program-stats select (or make it a compact mirror). Settings should only set startup default, not feel like a third mode switch. | No |
| Marketplace catalog UI | Sidebar `#marketplace-sidebar-list` + refresh; modal `#marketplace-dialog` + `#marketplace-list` (same `paintList` in `marketplace.ts`) | Sidebar is sufficient for studio; remove dead dialog or add one explicit “expand” affordance—do not maintain two full lists. | No |
| Add scene affordances | Left rail `#btn-add-scene` (+), scenes list `#btn-add-scene-alt` | Keep one add control; secondary can scroll/focus the primary. | No |
| Onboarding vs setup wizard | `SetupWizard` (first run), `OnboardingTour` (spotlight), Settings “Replay setup wizard” | Document order: setup → tour; avoid re-running both after replay. Consider tour skip when setup just finished. | No |
| Relay / live status signaling | Top bar `#relay-chip`, sidebar `#stream-status` / `#stream-info` | Consolidate copy and state machine; chip can be canonical, sidebar shows detail on hover/expand only. | No |
| Scene presets (built-in + custom) | Left scene buttons (`scene-gameplay`, …), `#studio-scenes-list` custom rows, settings scene images | Align naming: built-in scenes vs custom scenes panel; avoid two lists that look like peers without hierarchy. | No |
| Recording save path UX | Settings → Recording `recordingSaveFolder`; stop flow via `recording:save` | When folder is set, auto-save with `buildRecordingFileName` (timestamp + profile); Shift+Stop forces save dialog. Update settings hint copy to match (no longer “starting location” only). | **Yes** |
| Local recording vs stream quality messaging | Recording button hint, `destHint` compositor limitations, settings recording panel | Single short limitation note in recording hint or first record toast; remove repeated warnings. | No |
| Platform “last used” vs chip state | Settings `set-last-platform`, Go Live wizard platform radios, chip on/off | Persist last platform once; wizards pre-select from settings, chips reflect `streamDestinations` only. | No |
| Audio device / levels | Settings audio fields (if present), mixer `#audio-mixer`, source row `studio-source-mic` | Settings = default device; mixer = session levels only—cross-link in hint text, do not duplicate device pickers. | No |
| Browse tabs vs studio sources | Browse tab list, `studio-source-browser` / game / webcam rows | Clear rule: browser tab capture vs desktop capture; one place to enable browser layer on program. | No |
| Update banner vs settings auto-check | `#update-banner`, settings `autoCheckUpdatesOnStartup` | Keep banner for actionable updates; settings toggle only gates background check—same copy for “check now” vs banner dismiss. | No |

## Recording fix (implemented)

- **Main:** `saveRecording()` in `recording-io.ts` writes directly when `recordingSaveFolder` exists and `forceDialog` is false.
- **Renderer:** `buildRecordingFileName()` in `program-recording.ts`; stop handler passes `forceDialog: ev.shiftKey`.
- **Startup:** `recordingSaveFolder` loaded in `app.ts` `getSettings()` for button tooltip; IPC save path reads live settings on each stop.

Optional follow-up: Settings toggle “Ask where to save each time” (`recordingAskSaveEachTime`)—not added; Shift+Stop covers power users without more settings UI.
