# MakaLight release (GitHub + makalive.stream)

## Debug (always first)

```bash
npm ci
npm run prepare:relay
npm run makalight:debug
```

Optional integration: `MAKA_RELAY_INTEGRATION=1 npm run makalight:debug` (starts live relay).

Log default: `/opt/cursor/artifacts/makalight-debug.log` (override with `MAKALIGHT_DEBUG_LOG`).

## Package (Windows)

```bash
npm run makalight:package
```

Or CI: push tag **`makalight-v0.1.0`** or run workflow **MakaLight release** with that tag.

Workflow: [`.github/workflows/makalight-release.yml`](../.github/workflows/makalight-release.yml)

1. `makalight:debug`
2. `wails build` in `desktop-wails/`
3. Stage `relay/` + portable `node.exe` into `build/bin/`
4. Attach `MakaLight-amd64-installer.exe` + `MakaLight.exe` to GitHub Release

## Site

Update [`site/download.html`](../site/download.html) with the new tag URL, then deploy per [`docs/site-deploy.md`](site-deploy.md).

Copy installer to origin: `/opt/maka/web/downloads/MakaLight-amd64-installer.exe` (same pattern as `Maka-Setup-*.exe`).