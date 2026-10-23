# Maka gaming streaming service

**The ultimate streaming software for gamers and creators who want a resource-light alternative.**

![Maka studio with a live game stream in the program monitor](docs/readme-hero.png)

Maka is a Windows desktop **Electron studio** for capture, scenes, and **Go Live** without wiring up OBS first. A local **TabcastRelay** on `127.0.0.1:38473` takes WHIP from the app, encodes with FFmpeg, and pushes **RTMP** to Twitch, YouTube, or a custom RTMP endpoint. Stream keys stay in relay RAM — not written to disk by the UI.

**Website:** [tabcast.live.skydav.work](https://tabcast.live.skydav.work)

---

## Get Maka (v0.2.2 installer)

The current **unsigned** Windows installer on GitHub is **v0.2.2** (phone camera/mic add-on, QR pairing, 60s rejoin, STUN/TURN, and related streaming hardening).

### Option A — Download (Windows)

1. Download **[Maka-Setup-0.2.2.exe](https://github.com/n0social/tabcast-browser/releases/download/v0.2.2/Maka-Setup-0.2.2.exe)** from the [v0.2.2 release](https://github.com/n0social/tabcast-browser/releases/tag/v0.2.2).
2. Run the installer on **Windows 10 or 11** (x64).
3. **Windows SmartScreen** may warn because the build is **unsigned** — that is expected until code signing is in place.

The v0.2.2 installer does **not** include newer **live stream recovery** work on `main` (fatal-vs-blip retry policy, WHIP video stall watchdog, backup RTMP ingest failover). Build from `main` for those features.

### Option B — Build from source (`main`)

```bash
git clone https://github.com/n0social/tabcast-browser.git
cd tabcast-browser
git checkout main
npm install
npm run fetch:relay
npm run dev
```

On Windows, `npm run dist` produces the NSIS installer. Use **`v0.2.2`** if you need a tree that exactly matches the published installer above.

---

## What it does

| Piece | Role |
|--------|------|
| **Studio** | Program monitor, display/window capture, webcam/mic, layers, destinations, Go Live |
| **Browse** | Multi-tab Chromium pane (Twitch, YouTube Studio, chat) with optional chat pop-out |
| **TabcastRelay** | Local encoder on port **38473** — WHIP in, RTMP out to your platforms |

---

## Phone camera & mic

On **`main`**: optional add-on — pair your phone via **QR code**, use the phone as an independent camera and/or mic, **60s rejoin** if the connection drops, with **STUN** and optional **TURN**. The v0.2.2 installer includes this add-on; newer recovery features are on `main` only (see above).

---

## Live stream recovery (`main`)

Automatic reconnect with a **fatal-vs-blip** retry policy (ingest/key errors stop; network blips retry up to 30), a **WHIP outbound video stall** watchdog, and optional **backup RTMP ingest** failover when primary ingest fails.

---

## Requirements

| | Download | Source build |
|---|----------|--------------|
| **OS** | Windows 10/11 (x64) | Windows 10/11 recommended for `npm run dist` |
| **Node.js** | Not required | **Node 22+** |
| **Relay binary** | Bundled in installer | `npm run fetch:relay` (~400 MB into `vendor/relay`) |

---

## Architecture

```
[Display / window / webcam / mic / optional phone]
        │  capture APIs
        ▼
[Maka Studio UI]  ──WHIP──►  [TabcastRelay :38473]  ──RTMP──►  Twitch / YouTube / Custom
[Browse tabs / chat]
```

---

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

## Privacy & safety

- Keys are not written to disk by the browser UI (relay RAM only).
- **Demo mode** (Settings) skips stream-key format checks — useful for walkthroughs and testing without real keys.
- **Browse stays on streaming sites** — the built-in browser can't open Maka download or project pages (keeps you on Twitch, YouTube, and chat).

---

## SmartScreen & trust

The v0.2.2 installer is **unsigned**. SmartScreen may block or warn on first run. Only download from the official GitHub release linked above.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Repository

`https://github.com/n0social/tabcast-browser`
