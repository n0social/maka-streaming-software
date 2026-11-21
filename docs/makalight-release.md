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

Or CI (recommended — **this is your Windows installer factory**):

1. GitHub → **Actions** → **MakaLight release** → **Run workflow**
2. `ref`: `main` (after merge)
3. `tag`: `makalight-v0.1.4`

Or push tag **`makalight-v0.1.4`** to `main` after merge (same workflow on `push: tags: makalight-v*`).

Workflow: [`.github/workflows/makalight-release.yml`](../.github/workflows/makalight-release.yml) — runs on **`windows-latest`**, runs `makalight:debug`, `wails build`, stages `relay/` + portable Node, uploads **NSIS installer** to GitHub Releases.

You do **not** need a local Windows machine to ship; you need merge + one workflow run (or tag push).

1. `makalight:debug`
2. `wails build` in `desktop-wails/`
3. Stage `relay/` + portable `node.exe` into `build/bin/`
4. **`node scripts/makalight-nsis.mjs`** — rebuild NSIS so the installer includes the staged bundle (Wails’ first `makensis` pass runs too early)
5. Attach `MakaLight-amd64-installer.exe` + `MakaLight.exe` to GitHub Release

## Site

Update [`site/download.html`](../site/download.html) with the new tag URL, then deploy per [`docs/site-deploy.md`](site-deploy.md).

Copy installer to origin: `/opt/maka/web/downloads/MakaLight-amd64-installer.exe` (same pattern as `Maka-Setup-*.exe`).