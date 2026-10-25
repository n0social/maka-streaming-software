# Studio redesign handoff

Checkpoint tag: `0.2.3.1-redesign`. Latest WIP tag: `0.2.4-redesign-(wip)` — see `docs/release-wip-audit.md` for working vs disabled features.

This is the last dev checkpoint of the cream/gold studio before a new agent continues the work. The live Electron studio should match `docs/readme-hero.png` section by section. Keep the chrome cream (`#faf8f4`) and gold (`#c9a227`). The program monitor may stay black when nothing is captured. Do not turn the window chrome black.

Source of this UI: pull request [#32](https://github.com/n0social/maka-streaming-software/pull/32), branch `cursor/maka-mixer-layout-9bd4`. The horizontal mixer bars landed in `e4bc059` (`fix(ui): draw mixer levels as horizontal bars`). That branch already contains the earlier studio commits (cream/gold chrome, readme-style sidebars, program stats bar, encode presets, and the right-sidebar restyle), so it is the branch to land.

## Goal

Copy the generated README hero (`docs/readme-hero.png`) into the real studio, one section at a time:

- Left: Scenes, then Sources, then the status line.
- Center: program preview, then the stats bar under it.
- Right: Audio mixer, Stream controls, then Stream info pinned to the bottom.

## Where the code lives

| Piece | File |
| --- | --- |
| Layout (scenes, sources, program, mixer, stream controls, stream info) | `src/renderer/app.html` |
| Cream/gold tokens and the horizontal meter | `src/renderer/app.css` (`:root`, `.audio-mixer`, `.audio-meter`) |
| Mic level, scene clicks, stats text, encode menu wiring | `src/renderer/app.ts` (`startMicMeter`, `setMicMeterLevel`, `selectScene`, `updateProgramStats`) |
| Quality presets 720p30 through 4K60 | `src/shared/stream-encode-profiles.ts` |
| Scene template data the buttons do not apply yet | `src/shared/scene-templates.ts` |
| Overlay layout presets (Game Capture vs Overlay picker) | `src/shared/overlay-layout-presets.ts` |

Theme tokens in `app.css`: `--bg: #faf8f4`, `--gold: #c9a227`, text `#1a1408`. Sidebars are 252px (left) and 296px (right). Density tokens: `--studio-pad-x`, `--studio-pad-y`, `--studio-row-gap`. Top bar row is 34px tall.

## What is already in the UI

Verified against `app.html`, `app.css`, and `app.ts` on `cursor/maka-mixer-layout-9bd4`.

**Left.** Scenes lists five built-in rows (Gameplay, Starting Soon, Just Chatting, Intermission, Ending Scene) plus Add Scene. Sources lists Game Capture, Webcam, Microphone, and Overlay. Multiple source cascade pickers can stay open at once. **Game Capture** expands to displays/windows (`listCaptureSources` desktop paths) and marks the active capture. **Overlay** expands to named layout presets (webcam/chat/notification slots + gameplay full or PiP) that push `SceneLayout` via `pushSceneLayout`; chat and notifications are placeholder regions until wired. Search-tab browser capture lives under Overlay presets as "Search tab overlay", not as the only Overlay list. The footer reads "All systems nominal".

**Center.** Program preview with a "Program • Live Output" label. Under it, a stats bar: a disabled Program select, a quality dropdown, dropped frames, FPS, and resolution. The quality menu is filled from `ENCODE_PROFILE_ORDER`: 720p @ 30fps, 720p @ 60fps, 1080p @ 30fps, 1080p @ 60fps, 2K @ 60fps, 4K @ 60fps. Default is `720p30` (1280×720, 30 fps). FPS and resolution labels follow that preset, not a measured capture clock.

**Right.** Audio mixer, then Stream controls (Start Streaming, Start Recording, Start Virtual Camera), then Stream info at the bottom of the sidebar (`margin-top: auto` on `.studio-block-stream-info`).

### Audio mixer (accepted)

Three rows only: Desktop Audio, Microphone, Game Audio. Each row is icon, name, one horizontal track, gear. The level is the width of `.audio-meter` inside `.audio-meter-track`. The fill grows left to right. The gradient is fixed to the track (`background-size: 100cqi`): green `#3d9a5f` through 60%, gold `#c9a227` through 85%, red `#c94a27` at the right end.

The microphone bar follows the live mic. `startMicMeter` reads an `AnalyserNode` and `setMicMeterLevel` sets `micMeter.style.width` to a percent. That function also removes any inline `height`, so the bar cannot become a vertical strip.

Desktop and Game are not live. Their meters are a static `width: 12%` in `app.html`. Those rows are dimmed (`.audio-channel[title] { opacity: 0.55 }`).

Vertical meter strips and tall towers were rejected. Do not revert this to vertical bars.

## Intentionally disabled

| Control | Why |
| --- | --- |
| Desktop Audio (row, gear, meter stuck at 12%) | Title on the row: "Desktop audio capture not yet implemented". |
| Game Audio (row, gear, meter stuck at 12%) | Title on the row: "Game audio capture not yet implemented". |
| Start Recording | Button `disabled`. Title: "Recording is not available in this build yet". |
| Start Virtual Camera | Button `disabled`. Title: "Virtual camera is not available in this build yet". |

`app.ts` leaves the desktop and game faders as a no-op for the same reason.

## Not a 1:1 copy yet

Compared with `docs/readme-hero.png`:

- **Title bar.** Brand lockup reads "Maka Studio". The app top bar still has Stream/Search tabs, a relay chip, a "0.2" version, settings, and a second Go Live button. The hero shows help + settings only.
- **Scene and source rows.** Scenes list uses hero-style gold fill for the active row (`.studio-list--scenes`). **Just Chatting** and the three holding scenes expose a `⋯` menu → **Choose image…** / **Clear image** (Electron `dialog.showOpenDialog` via `window.tabcast.pickSceneImageFile()`). Paths persist in settings as `sceneImages` keyed by scene id (`desk-only`, `starting-soon`, `intermission`, `ending`). Gameplay’s `⋯` stays decorative. Sidebar **Choose image…** appears for the active scene when uploads are supported. `selectScene` switches templates: **Gameplay** (`gaming-cam`, game+cam on), **Just Chatting** (`desk-only`, cam + optional game-mask image), **Starting Soon / Intermission / Ending** (stub card **or** full-program image mask). Add Scene is disabled (`Custom scenes are not available in this build yet`). `browse-showcase` exists in the template file and is not in the list.
- **Program.** The image shows a composed gameplay frame (HUD, webcam picture-in-picture, gold "Program • Live Output" on a dark pill). The empty app program is cream (`#f6f3ec`) with the line "Select a display or window to start streaming". Once a capture is attached, `#program-video` is black (`background: #000`). Per-scene PNG/JPG backgrounds render on `#program-scene-bg` with mask rules from `sceneImageMaskMode()` (`game-mask-only` vs `full-mask-except-chat`). Relay `SceneLayout` includes a `scene-image` overlay source with `assetPath` / `assetMime`; WHIP still sends live video tracks only until relay compositing reads those assets.
- **Stats bar.** Lower program column: **left** — disabled Studio Mode dropdown only (no second quality dropdown; the old empty `#program-quality-select` beside Studio Mode was removed). **Right** (flex end) — dropped frames, FPS, latency placeholder, **Twitch | YouTube** platform chips (open `#platform-key-dialog` for enable + stream key), stream health pill, **Mbps**, and **`#program-quality-select`** encode preset dropdown (`720p @ 30fps`, etc.; tooltip shows target/transmit bitrate when live). Keys and `dest-twitch` / `dest-youtube` live only in the dialog.
- **Mixer vs the image.** dB ticks (-30 … 0) sit under each horizontal bar. Tracks stay 14px tall. Keep the red gradient end and width-based fill.
- **Stream controls.** Sidebar primary button reads "Go Live" / "End Live" (matches the top bar).
- **Stream info.** The image shows a thumbnail, title, category, Live pill, viewers, and duration. The app still shows placeholders for metadata. Sidebar Stream Info is **preview + meta only** (no Twitch/YouTube checkboxes, key fields, or encode profile — those moved to the stats bar / platform key dialog). The old sidebar `#profile-select` / `.stream-encode` block is removed; custom RTMP fields live in `.studio-legacy-host` so they do not auto-place in the app grid. Stream info card uses a larger thumb (~84px), tighter horizontal padding, and bold title / category / status row.

## Screenshot comparison ritual

**Policy:** After every UI edit, agents must refresh the studio capture and post a **hero vs current studio** pair in the chat reply so reviewers can see drift at a glance.

### When to run

- Any change to `src/renderer/app.html`, `app.css`, `app.ts`, or other studio-visible UI.
- Before opening or updating a UI pull request (even doc-only PRs that touch layout copy in the renderer).

### Steps

1. **Build and preview** from the repo root:
   ```bash
   npm run build
   npm run preview
   ```
   Leave the Electron window on the default **Studio** view (cream/gold chrome, empty program message is fine).

2. **Capture the live studio** into the tracked reference file:
   ```bash
   # Preferred when the main process receives the env var (see src/main/index.ts):
   MAKA_CAPTURE_PATH=docs/redesign-references/studio-current.png npm run preview
   ```
   If that exits without writing the file (common in headless/cloud VMs), capture the visible window instead (example: `ffmpeg` + `xdotool` on Linux) and save the result as `docs/redesign-references/studio-current.png`.

3. **Copy embeds for chat** (paths the coordinator uses to attach images in the agent response):
   ```bash
   mkdir -p /opt/cursor/artifacts/redesign-references
   cp docs/readme-hero.png /opt/cursor/artifacts/redesign-references/readme-hero-target.png
   cp docs/redesign-references/studio-current.png /opt/cursor/artifacts/redesign-references/studio-current.png
   ```
   `readme-hero-target.png` in `docs/redesign-references/` is the same hero as `docs/readme-hero.png`; refresh the artifact copy when the hero changes.

4. **Post in the agent message:** embed **both** `/opt/cursor/artifacts/redesign-references/readme-hero-target.png` and `studio-current.png` (hero left / target, studio right / current).

5. **Commit** `docs/redesign-references/studio-current.png` with the UI change (do not commit `/opt/cursor/artifacts/` — chat-only).

### Reference paths

| Role | Repo path | Chat artifact |
| --- | --- | --- |
| Target (README hero) | `docs/readme-hero.png` | `/opt/cursor/artifacts/redesign-references/readme-hero-target.png` |
| Current studio | `docs/redesign-references/studio-current.png` | `/opt/cursor/artifacts/redesign-references/studio-current.png` |
| Baseline at tag | `docs/redesign-references/studio-at-0.2.3.1-redesign.png` | (historical; no need to refresh each edit) |

More detail: `docs/redesign-references/README.md`.

## Next session

Continue section by section against `docs/readme-hero.png`. Do not flip the mixer back to vertical bars or tall towers. Do not repaint the studio chrome black to match an empty program monitor.
