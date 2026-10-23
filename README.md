# Maka gaming streaming service

**The ultimate streaming software for gamers and creators who want a resource-light alternative.**

![Maka studio with a live game stream in the program monitor](docs/readme-hero.png)

Maka is a Windows desktop **Electron studio** for capture, scenes, and **Go Live** without wiring up OBS first. A local **TabcastRelay** on `127.0.0.1:38473` takes WHIP from the app, encodes with FFmpeg, and pushes **RTMP** to Twitch, YouTube, or a custom RTMP endpoint. Stream keys stay in relay RAM — not written to disk by the UI.

**Website:** [tabcast.live.skydav.work](https://tabcast.live.skydav.work)

---

## Get Maka (v0.2.2)

The current public build is **unsigned** v0.2.2 (phone camera/mic add-on, QR pairing, and related streaming hardening live on the `v0.2.2` tag — not on `main`).

### Option A — Download (Windows)

1. Download **[Maka-Setup-0.2.2.exe](https://github.com/n0social/tabcast-browser/releases/download/v0.2.2/Maka-Setup-0.2.2.exe)** from the [v0.2.2 release](https://github.com/n0social/tabcast-browser/releases/tag/v0.2.2).
2. Run the installer on **Windows 10 or 11** (x64).
3. **Windows SmartScreen** may warn because the build is **unsigned** — that is expected until code signing is in place.

### Option B — Build from source (same version as the installer)

Check out the release tag so your tree matches the download:

```bash
git clone https://github.com/n0social/tabcast-browser.git
cd tabcast-browser
git checkout v0.2.2
npm install
npm run fetch:relay
npm run dev
```

On Windows, `npm run dist` produces the NSIS installer. Building `main` is older source; use **`v0.2.2`** for the release that matches the installer above.

---

## What it does

| Piece | Role |
|--------|------|
| **Studio** | Program monitor, display/window capture, webcam/mic, layers, destinations, Go Live |
| **Browse** | Multi-tab Chromium pane (Twitch, YouTube Studio, chat) with optional chat pop-out |
| **TabcastRelay** | Local encoder on port **38473** — WHIP in, RTMP out to your platforms |

---

## Phone camera & mic (v0.2.2)

Optional add-on in the **0.2.2** build: pair your phone via **QR code**, use the phone as an independent camera and/or mic, **60s rejoin** if the connection drops, with **STUN** and optional **TURN**. This ships in the v0.2.2 installer and tag; it is **not** on the `main` branch yet.

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

## SmartScreen & trust

The v0.2.2 installer is **unsigned**. SmartScreen may block or warn on first run. Only download from the official GitHub release linked above.

---

## License

MIT — see [LICENSE](./LICENSE).

---

## Repository

`https://github.com/n0social/tabcast-browser`
