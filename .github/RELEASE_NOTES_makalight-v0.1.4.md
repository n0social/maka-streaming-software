# MakaLight v0.1.4

## Fixes

- **Webcam LED flicker** — Stop probing the camera with `getUserMedia` on idle startup; only request camera/mic when you open the webcam or mic picker (or phone companion tracks need labels).
- **Relay chip stuck on offline** — Poll relay health every 2s and emit `relay:update` during auto-start so the UI moves from Starting → Ready instead of sitting on Relay offline.
- **App version** — Settings and footer use embedded MakaLight product version (`0.1.4`), not the monorepo Electron version.

## Install

Download **MakaLight-amd64-installer.exe** from this release (not the portable `MakaLight.exe` only) so relay and Node are installed and the app appears in Windows Settings → Apps.