# MakaLight 0.1.3 — Windows Add/Remove Programs

- NSIS: explicit per-machine install (`RequestExecutionLevel admin`), 64-bit uninstall registry view, and `InstallLocation` for Settings → Apps (Wails `Uninstall\MAKAMakaLight` key).
- Download page clarifies **installer** vs loose **portable** `MakaLight.exe`.

**Install:** run **`MakaLight-amd64-installer.exe`** (not the loose exe) so the app appears as **MakaLight** (publisher **MAKA**) under Settings → Apps or Control Panel → Programs and Features.

Default folder: `C:\Program Files\MAKA\MakaLight\`.

## Download

**[MakaLight-amd64-installer.exe](https://github.com/n0social/maka-streaming-software/releases/download/makalight-v0.1.3/MakaLight-amd64-installer.exe)** (NSIS, recommended)

Optional portable: **[MakaLight.exe](https://github.com/n0social/maka-streaming-software/releases/download/makalight-v0.1.3/MakaLight.exe)** — only if you copy `relay/` + `node/` beside it.

Site: [makalive.stream/download.html](https://makalive.stream/download.html) · GitHub mirror path after deploy: `https://makalive.stream/downloads/MakaLight-amd64-installer.exe`