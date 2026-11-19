# Resource utilization analysis

makalive.stream here means the **downloadable Windows studio** (Maka), not the website. The installer is an Electron app: it ships its own Chromium and Node.js. That is why its memory and CPU sit in the same class as OBS. OBS is one native process that composites and encodes. Maka opens a browser runtime, then still encodes for the stream.

This note is the architecture and the measurement plan. It is not a benchmark. No idle RAM, CPU, GPU, or in-game FPS numbers have been collected yet.

## What the downloadable app runs today

Maka 2.8.3:

1. Electron (Chromium + Node) draws the studio and any in-app browser tab.
2. The studio sends video to MAKArelay on `127.0.0.1` with WebRTC (WHIP). Chromium encodes that hop.
3. MAKArelay (open `relay/` 0.1.1 or legacy v0.1.0 exe) runs FFmpeg, encodes (or copies H.264 on one-pass) and pushes **RTMP** to Twitch or YouTube.

The website is only the download page. It does not run the stream.

## Why a native widget toolkit is the wrong swap

Tkinter (or a similar native form toolkit) does not include WebRTC. The studio UI is HTML and the live path is `RTCPeerConnection`. Rebuilding every panel in a toolkit would drop the layout and still leave the capture and encode problem to solve again.

## Direction for a second desktop app

Keep the HTML/CSS/TypeScript screens. Replace the Electron shell with a system webview so the app does not ship a second Chromium.

| Shell | Backend | UI engine | What changes for this app |
| --- | --- | --- | --- |
| Electron (current) | Node | Bundled Chromium | Studio, WebRTC, and a full browser runtime in the installer |
| Tauri | Rust | Windows WebView2, WebKit on macOS/Linux | Same pages. WebRTC comes from the OS webview. Installer no longer contains Chromium |
| Wails | Go | Same OS webviews | Same pages. Windows and macOS WebRTC come from the system webview. Linux needs WebKitGTK built with WebRTC |

**MakaLight** (`desktop-wails/`) is the flagship Wails app beside the existing renderer pages, using WebView2 on Windows. Electron builds stay frozen for comparison. Idle figures such as “30–50 MB” are vendor claims, not measurements of MakaLight.

Harness (stub): [`benchmark/`](../benchmark/README.md). Full Windows sampling documented in [wails-migration-plan.md](./wails-migration-plan.md).

What that shell does **not** fix by itself: the encode path. A webview that still sends WHIP and then FFmpeg still encodes. The lightweight studio only wins if the duplicate app also has one encode into RTMP.

## Comparison the paper will use

Three downloadable stacks, same scene, same resolution, fps, bitrate, and encoder:

| Stack | Process model |
| --- | --- |
| OBS Studio | Native app, one composite, one encode, RTMP out |
| Maka Electron | Bundled Chromium + Node, WebRTC hop, FFmpeg RTMP out |
| MakaLight (Wails, flagship) | Go + WebView2, WHIP + open relay, RTMP out |

## How to measure (no numbers until this is run)

Lock the machine before any run: exact CPU, GPU, RAM, disk, and Windows build. Close Discord, browsers, overlays, and updaters. Power plan on High Performance.

Every app uses the same settings, for example 1080p60 at 6000 kbps, same hardware encoder when the GPU has one, otherwise the same x264 preset. The source is a looping local file or a fixed game benchmark, not a live cloud session that changes.

Three states, each sampled for 10 minutes, at least three runs, report the median:

| State | Meaning |
| --- | --- |
| Idle | App open, preview on, not streaming |
| Streaming | Sustained encode and RTMP |
| In-game | Streaming while a heavy 3D scene runs |

| Metric | How | Why |
| --- | --- | --- |
| Private RAM | Sum of private bytes for the main process and helpers (`msedgewebview2.exe` for Wails, Chromium renderers for Electron) | Working set double-counts shared libraries |
| CPU | Average and 99th percentile over the window (`typeperf` or Performance Monitor) | Shows polling and stutter risk |
| GPU | 3D engine separate from Video Encode (GPU-Z or GPU counters) | Shows whether the UI steals game render time |
| Cold start and installer size | Time to first frame, bytes on disk | Distribution cost |
| Game frame time | Average FPS and 1% low (PresentMon or CapFrameX) | What the player feels |

Poll the process tree once a second into a CSV. Do not read a single Task Manager glance.

## Paper outline

1. Title and abstract. Problem: bundled Chromium in a desktop streaming app. Change: a Wails (or Tauri) duplicate. Result: only after the table above is filled in.
2. Architecture diagram of the three stacks.
3. Method and the machine spec.
4. Tables and time-series for idle, streaming, and in-game.
5. Tradeoffs: WebView2 vs WebKitGTK, WebRTC codec differences, and what OBS still does better (multi-source scenes).
6. Appendix: scripts and raw CSV.

Diagrams in Mermaid or Excalidraw. Charts from the CSV. Markdown compiled with Pandoc or Typst. Host the PDF with the downloadable app’s site only after the numbers exist.

## Relay 0.1.1

Relay **0.1.1** is open source under `relay/` (WHIP + FFmpeg). The closed `MAKArelay.exe` sidecar is removed from the Electron app. Platform title, description, and thumbnail are edited in `src/main/platform-metadata.ts`. RTMP stays the video path.
