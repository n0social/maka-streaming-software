# Studio redesign handoff

Checkpoint tag: `0.2.3.1-redesign`.

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

Theme tokens in `app.css`: `--bg: #faf8f4`, `--gold: #c9a227`, text `#1a1408`. Sidebars are 268px (left) and 300px (right).

## What is already in the UI

Verified against `app.html`, `app.css`, and `app.ts` on `cursor/maka-mixer-layout-9bd4`.

**Left.** Scenes lists five built-in rows (Gameplay, Starting Soon, Just Chatting, Intermission, Ending Scene) plus Add Scene. Sources lists Game Capture, Webcam, Microphone, and Overlay. The footer reads "All systems nominal".

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
- **Scene and source rows.** Rows now have a trailing `⋯` menu (visual only) and Gameplay starts selected. `selectScene` applies `gaming-cam` / `desk-only` layer defaults and pushes `SCENE_TEMPLATES` layouts when live. Starting Soon, Intermission, and Ending Scene have no template. Add Scene does not open a creator. `browse-showcase` exists in the template file and is not in the list.
- **Program.** The image shows a composed gameplay frame (HUD, webcam picture-in-picture, gold "Program • Live Output" on a dark pill). The empty app program is cream (`#f6f3ec`) with the line "Select a display or window to start streaming". Once a capture is attached, `#program-video` is black (`background: #000`). That black video surface is fine. The surrounding chrome stays cream and gold.
- **Stats bar.** Studio Mode, `Dropped Frames: N (0.0%)`, FPS from the encode preset, a latency placeholder (`—` until measured), and quality options labeled `Auto (W×H)`. Hero shows FPS 60, `17 ms`, and `Auto (1920×1080)` as marketing defaults.
- **Mixer vs the image.** dB ticks (-30 … 0) sit under each horizontal bar. Tracks stay 14px tall. Keep the red gradient end and width-based fill.
- **Stream controls.** Sidebar primary button reads "Go Live" / "End Live" (matches the top bar).
- **Stream info.** The image shows a thumbnail, a title ("Epic Fantasy Raids & Chill"), a category ("Fantasy Games"), a red Live pill, a viewer count, and a duration. The app shows "No preview", title and category "—", an Offline/Live pill, and viewers and duration stuck at "—". Under that, the app has Twitch, YouTube, and custom RTMP key fields plus a second encode-profile select. Those controls are not in the image.

## Next session

Continue section by section against `docs/readme-hero.png`. Do not flip the mixer back to vertical bars or tall towers. Do not repaint the studio chrome black to match an empty program monitor.
