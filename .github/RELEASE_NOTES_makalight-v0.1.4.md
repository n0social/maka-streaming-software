# MakaLight v0.1.4

## Fixes

- **Relay never starts (0.1.3 installs)** — The NSIS step ran before `relay/` and `node.exe` were staged, so the published installer often contained only `MakaLight.exe`. CI now runs `makalight-nsis.mjs` after staging so the installer bundles relay + portable Node.
- **Webcam LED flicker** — Stop probing the camera with `getUserMedia` on idle startup; only request camera/mic when you open the webcam or mic picker (or phone companion tracks need labels).
- **Relay chip stuck on offline** — Lifecycle maps to `ready`/`live` (not `running`); poll health every 2s and emit during auto-start; chip shows a short error when autostart fails.
- **App version** — Settings and footer use embedded MakaLight product version (`0.1.4`), not the monorepo Electron version.

## Install

Download **MakaLight-amd64-installer.exe** from this release (not the portable `MakaLight.exe` only) so relay and Node are installed and the app appears in Windows Settings → Apps.