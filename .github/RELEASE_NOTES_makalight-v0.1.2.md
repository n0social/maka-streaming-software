# MakaLight 0.1.2 — relay chip + version labels

- Fix relay snapshot lifecycle (`ready` / `live`, no invalid `running`) and poll `/health` + `/status` like Electron.
- Show **MakaLight 0.1.2** from embedded product version (not monorepo `package.json` 2.8.3).
- Refresh settings/version labels when relay reports `health.version`.
- Windows `platform: win32` for capture/audio parity.

**Install:** `MakaLight-amd64-installer.exe` (exe + relay + node).