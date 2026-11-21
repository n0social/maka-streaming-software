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
3. `tag`: `makalight-v0.1.0`

Or push tag **`makalight-v0.1.0`** to `main` after merge (same workflow on `push: tags: makalight-v*`).

Workflow: [`.github/workflows/makalight-release.yml`](../.github/workflows/makalight-release.yml) — runs on **`windows-latest`**, runs `makalight:debug`, builds the exe, stages `relay/` + portable Node into `build/bin`, then **`wails build -nsis`** so **`MakaLight-amd64-installer.exe` ships exe + relay + node** (custom [`desktop-wails/build/windows/installer/project.nsi`](../desktop-wails/build/windows/installer/project.nsi)).

You do **not** need a local Windows machine to ship; you need merge + one workflow run (or tag push).

1. `makalight:debug`
2. `wails build -nopackage` → stage `relay/` + `node/node.exe` → `wails build -nsis`
3. Attach `MakaLight-amd64-installer.exe` (+ optional loose `MakaLight.exe`) to GitHub Release

### Installer vs portable exe

| Asset | Register in Add/Remove Programs? |
| --- | --- |
| `MakaLight-amd64-installer.exe` | **Yes** — writes `HKLM\…\Uninstall\MAKAMakaLight` |
| `MakaLight.exe` (release asset) | **No** — run-from-folder portable; use for dev/ZIP layouts only |

Ship the installer to end users. The loose exe is optional for advanced users who manage their own folder layout.

### Windows validation (after install)

1. Run `MakaLight-amd64-installer.exe` elevated (UAC).
2. Settings → Apps → Installed apps: find **MakaLight** (publisher **MAKA**), version matches `wails.json` `productVersion`.
3. Or **Programs and Features**: same entry; uninstall via Settings or `%ProgramFiles%\MAKA\MakaLight\uninstall.exe`.
4. Registry check (Admin CMD):  
   `reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\MAKAMakaLight" /v DisplayName`

## Site

Update [`site/download.html`](../site/download.html) with the new tag URL, then deploy per [`docs/site-deploy.md`](site-deploy.md).

Copy installer to origin: `/opt/maka/web/downloads/MakaLight-amd64-installer.exe` (same pattern as `Maka-Setup-*.exe`).