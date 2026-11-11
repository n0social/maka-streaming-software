# Release build — Windows installer

Maka packages **only on Windows** (`electron-builder` + NSIS + bundled `MAKArelay.exe`). Linux/macOS dev machines can still run `npm run build` and `npm run verify:offline`, but not produce `Maka-Setup-*.exe`.

## Local (Windows)

```bash
npm ci
npm run fetch:relay
npm run dist          # unsigned NSIS when CSC_* unset
# or signed + optional GitHub publish:
npm run dist:signed   # set CSC_LINK + CSC_KEY_PASSWORD; MAKA_PUBLISH=1 to publish
node scripts/update-browser-manifest.mjs
```

Outputs: `dist-installer/Maka-Setup-<version>.exe`, `dist-installer/latest.yml`, `site/browser-manifest.json`.

## CI (artifact or draft release)

**Actions → Build Windows installer → Run workflow**

| Input | Use |
| --- | --- |
| `ref` | Branch or tag to build (e.g. `cursor/release-pack-0.2.6-c0c7` or `main`) |
| `upload_release` | `true` to attach files to a **draft** GitHub Release |
| `tag_name` | Required when `upload_release` is true (e.g. `maka.streaming.v0.2.7`) |

The job always uploads a workflow **artifact** with the installer and manifest.

## Tagged release (publish) — recommended for “latest” on GitHub

Push a tag matching `v*` or `maka.streaming.*` on the commit you want to ship. That starts the **Release** workflow (`release.yml`):

```bash
git tag -a v0.2.6 -m "Maka 0.2.6"
git push origin v0.2.6
```

The job builds on `windows-latest`, attaches `Maka-Setup-<version>.exe`, `latest.yml`, and `site/browser-manifest.json` to the GitHub Release (unsigned when `CSC_LINK` is not set). `contains(tag, 'wip')` creates a **draft** release.

Alternatively: **Actions → Release → Run workflow** and pass an **existing** tag name.

## Version

Bump `package.json` `version` before tagging so `Maka-Setup-${version}.exe` matches marketing and `latest.yml` auto-update metadata.
