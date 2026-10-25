# Backup: `maka.streaming.v.01`

Studio redesign Windows installer backed by manifest + download script (installer is ~182 MiB; not stored in Git).

| Field | Value |
| --- | --- |
| Git tag | `maka.streaming.v.01` |
| Commit | `2421964a9008501ad7d5bf62df09fd64d9e3fffe` |
| Package version | `0.2.4-redesign-wip` |
| GitHub Release | https://github.com/n0social/maka-streaming-software/releases/tag/maka.streaming.v.01 |
| CI (success) | https://github.com/n0social/maka-streaming-software/actions/runs/40239100242 |

## Download backup into this folder

From the repo root:

```bash
npm run fetch:release-backup
```

Installer path after fetch:

`releases/backup/maka.streaming.v.01/Maka-Setup-0.2.4-redesign-wip.exe`

Verify the installer (after fetch):

```bash
cd releases/backup/maka.streaming.v.01
sha256sum -c SHA256SUMS 2>/dev/null | grep -F '.exe'
```

Optional release metadata (`latest.yml`, blockmap, browser manifest): `npm run fetch:release-backup -- --all`, then `sha256sum -c SHA256SUMS`.

## Rebuild from source (Windows)

Signed release builds match CI and require **Windows** (`windows-latest` in `.github/workflows/release.yml`). Linux dev machines can typecheck and bundle app code, but NSIS packaging and Authenticode signing are run on Windows in CI.

```powershell
git fetch --tags
git checkout maka.streaming.v.01
npm ci
npm run fetch:relay
```

Production signed build (needs `CSC_LINK` / `CSC_KEY_PASSWORD` — see `docs/CODE-SIGNING.md` if present):

```powershell
npm run dist:signed
```

Unsigned local installer (no cert):

```powershell
npm run dist
```

Outputs land in `dist-installer/` (gitignored). CI uploads `dist-installer/*` to the GitHub Release for the tag.

## Related tags

- `v0.2.4-redesign-wip` — draft release with the same installer artifact name from an earlier CI run
- `0.2.3.1-redesign` — last dev checkpoint before the streaming tag (see `docs/studio-redesign-handoff.md`)
