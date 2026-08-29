# Tabcast Browser

**Chromium + local relay** for gaming/streaming education — capture, scene, and Go Live in one desktop app. Not a website wrapper.

Built for classrooms, labs, and makers who want a transparent WHIP → FFmpeg → RTMP pipeline without OBS complexity.

## What it is

| Mode | Job |
|------|-----|
| **Studio** | Program monitor, display/window capture, webcam/mic, layers, destinations |
| **Browse** | Multi-tab Chromium pane (pinned Twitch / YouTube Studio / chat) + chat pop-out |

Local **TabcastRelay** on `127.0.0.1:38473` encodes and pushes to Twitch/YouTube. Stream keys stay in relay RAM only.

## Requirements

- Windows 10/11
- Node.js 22+
- ~400MB for the relay binary (`npm run fetch:relay`)

## Quick start

```bash
npm install
npm run fetch:relay   # downloads TabcastRelay.exe into vendor/relay (gitignored)
npm run dev           # or: npm run build && npm run preview
npm run verify        # health + binary checks
```

## Architecture (edu)

```
[Desktop / webcam / mic]
        │  getUserMedia / desktopCapturer
        ▼
[Tabcast Browser UI]  ──WHIP──►  [TabcastRelay :38473]  ──RTMP──►  Twitch / YouTube
[Browse tabs / chat]
```

## v0.2 features

- Multi-tab Browse with pinned Twitch / YT Studio / Chat
- Chat pop-out window
- Audio meter, layer show/hide, webcam size → `/scene`
- Custom titlebar, system tray (minimize while live)
- Settings (lab mode, startup mode, tray)
- Browse session persistence (`persist:tabcast-browse` + saved tabs)
- Crash diagnostics + relay auto-restart

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Electron + Vite dev |
| `npm run build` | Production build to `out/` |
| `npm run preview` | Run built app |
| `npm run fetch:relay` | Fetch relay binary |
| `npm run verify` | Offline verification |
| `npm run dist` | Windows installer via electron-builder |
| `npm run dist:signed` | Signed release (needs `CSC_LINK` — see [docs/CODE-SIGNING.md](./docs/CODE-SIGNING.md)) |
| `npm run release:manifest` | Update `site/browser-manifest.json` from latest build |

## Privacy / lab use

- Keys are not written to disk by the browser UI (relay RAM only).
- **Lab mode** (Settings) relaxes stream-key shape checks for demos.
- Hosts under `skydav.work` are blocked from Browse navigation.

## License

MIT — see [LICENSE](./LICENSE).

## Repo

https://github.com/n0social/tabcast-browser
