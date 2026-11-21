# MakaLight {{version}} — flagship Windows studio

**MakaLight** is the downloadable studio for [makalive.stream](https://makalive.stream): Go + **WebView2**, same studio UI as Maka Electron, **without bundling Chromium**. Open **MAKA.relay** 0.1.1 is included beside the app.

## Download

**[MakaLight-amd64-installer.exe](https://github.com/n0social/maka-streaming-software/releases/download/{{tag_name}}/MakaLight-amd64-installer.exe)** (NSIS)  
The NSIS installer includes **MakaLight.exe**, **open MAKA.relay** (`relay/`), and **node.exe** under the install directory (same idea as Maka Electron’s bundled relay).

Optional portable: **[MakaLight.exe](https://github.com/n0social/maka-streaming-software/releases/download/{{tag_name}}/MakaLight.exe)** only if you also copy `relay/` + `node/` beside it.

Mirror after site deploy: `https://makalive.stream/downloads/MakaLight-amd64-installer.exe`

## Requirements

- Windows 10/11 x64
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on most Windows 11)
- Stream keys / optional Twitch or YouTube tokens in Settings

## What's in this build

- Auto-start open relay on port **38473**, WHIP publish from the studio
- Win32 capture list, window game audio (`loopback-capture` worker)
- Recording + scene image pickers, diagnostics + QoS export
- **No in-app browser** (Search tab not shipped)

## Legacy

**Maka Electron v2.8.3** remains on [GitHub Releases](https://github.com/n0social/maka-streaming-software/releases/tag/v2.8.3) as a benchmark baseline only.

## Verify

Developers: `npm run makalight:debug` then `wails build` in `desktop-wails/`.