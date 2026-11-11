## Maka v0.2.6.1 — Windows streaming software

**Current recommended build.** The installer reports app version **0.2.6**; download this release by tag **v0.2.6.1** (includes fixes after the earlier `v0.2.6` tag from the same day).

### What’s new in v0.2.6.1

- **Go Live / WHIP** — publish through the main process; clear stale relay “Ready” when health is lost; renderer fallback if loopback fetch fails (**#61**, **#62**).
- **Go Live wizard** — full-width encode profile control; **4-step** flow (chat step removed; use sidebar Chat like Notifications).
- **Studio overlays** — overlay menu is layout presets only (no Search tab overlay list); chat menu is **Chat off** + **placeholder panel** only.
- **Scenes** — switching to **Gameplay** keeps your overlay layout preset.
- **Sources** — refresh control centered in its circular button.

### Core (0.2.6 studio stack)

- **Game capture & scenes** — display/window capture, webcam/mic, program monitor, Go Live to Twitch, YouTube, or custom RTMP.
- **Local WHIP relay** — MAKArelay on `127.0.0.1:38473`; stream keys stay in relay RAM.
- **Phone camera/mic add-on** — QR pairing (v0.2.4+).
- **Live stream recovery** — ingest retries, WHIP stall watchdog, optional backup RTMP.

### Windows installer

Download **[Maka-Setup-0.2.6.exe](https://github.com/n0social/maka-streaming-software/releases/download/v0.2.6.1/Maka-Setup-0.2.6.exe)** from the assets below, or [makalive.stream/download](https://makalive.stream/download).

**Windows SmartScreen** may warn on unsigned builds — *More info* → *Run anyway* if you trust this release.

### Older tag

The **`v0.2.6`** release (earlier Nov 11 build) does **not** include the wizard/overlay fixes in **v0.2.6.1**. Use **v0.2.6.1** for testing.
