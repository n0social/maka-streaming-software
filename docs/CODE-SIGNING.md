# Windows code signing — Maka

Authenticode signing reduces SmartScreen warnings and helps enterprise allow-listing. This repo ships **signing infrastructure**; you supply the certificate.

## P0 checklist (level2 — tackle in order)

| # | Item | Status |
|---|------|--------|
| 1 | **Code signing** (this doc) | Infrastructure ready — needs your cert |
| 2 | Auto-update (`electron-updater` + GitHub Releases) | Pending |
| 3 | Onboarding phase 2 (relay test + capture wizard) | Partial (tour shipped) |
| 4 | CI/CD (tag → build → sign → release) | Pending |
| 5 | Live session lifecycle | Mostly done (`before-quit` + WHIP teardown) |

---

## What gets signed

| Artifact | When | Tool |
|----------|------|------|
| `MAKArelay.exe` (vendor + bundled) | Before `electron-builder` | `scripts/sign-windows.mjs` |
| `Maka.exe` | During `electron-builder` | electron-builder + `@electron/windows-sign` |
| `Maka-Setup-*.exe` (NSIS) | During `electron-builder` | electron-builder |
| Optional: unpacked outputs | After build (`--all`) | `scripts/sign-windows.mjs` |

All signatures use **SHA-256** + a **timestamp server** (Digicert by default) so they stay valid after cert expiry.

---

## Certificate options

| Type | SmartScreen | Typical cost | Notes |
|------|-------------|--------------|-------|
| **Standard OV** | Builds reputation over time | $200–400/yr | DigiCert, Sectigo, SSL.com |
| **EV** | Faster initial trust | $400–700/yr | Requires org validation, USB token often |

Purchase from a Microsoft-trusted CA. Export as **`.pfx`** (includes private key) for CI, or use an EV USB token on the signing machine.

---

## Local signing (one-time setup)

### 1. Environment variables

Create a local env file (never commit). Example `.env.signing.local`:

```bash
# Path to your .pfx OR base64-encoded pfx (electron-builder accepts both)
CSC_LINK=C:\certs\maka-code-sign.pfx
CSC_KEY_PASSWORD=your-pfx-password

# Optional overrides
MAKA_TIMESTAMP_URL=http://timestamp.digicert.com
MAKA_SIGNING_REQUIRED=1
```

PowerShell for current session:

```powershell
$env:CSC_LINK = "C:\certs\maka-code-sign.pfx"
$env:CSC_KEY_PASSWORD = "your-password"
```

### 2. Windows SDK `signtool`

Install [Windows SDK](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/) (Signing Tools for Desktop Apps), or use Visual Studio Build Tools. `signtool.exe` must be on `PATH` or discoverable under `Program Files (x86)\Windows Kits\10\bin\`.

### 3. Signed release build

```bash
npm run dist:signed
```

This runs:

1. Sign `vendor/relay/MAKArelay.exe` (if present)
2. `typecheck` → `build` → `verify:offline` → `electron-builder`
3. Verify signatures on relay + main exe + NSIS installer

Unsigned dev build (unchanged):

```bash
npm run dist
```

### 4. Verify only

```bash
node scripts/sign-windows.mjs --verify dist-installer/Maka-Setup-0.2.0.exe
node scripts/sign-windows.mjs --verify vendor/relay/MAKArelay.exe
```

---

## electron-builder configuration

In `package.json` → `build.win`:

- `signAndEditExecutable: true` — sign app exe when `CSC_*` is set
- `forceCodeSigning: false` — do not fail unsigned local builds
- `signtoolOptions.timeStampServer` — Digicert timestamp

electron-builder reads `CSC_LINK` / `CSC_KEY_PASSWORD` automatically. No cert → build completes unsigned (with optional warning).

Set `MAKA_SIGNING_REQUIRED=1` to **fail** `dist:signed` when no certificate is configured.

---

## CI / GitHub Actions (preview — full workflow in P0 #4)

Store secrets:

| Secret | Value |
|--------|--------|
| `CSC_LINK` | Base64-encoded `.pfx` **or** secure file URL |
| `CSC_KEY_PASSWORD` | PFX password |

Job step (after `npm run dist:signed`):

```yaml
env:
  CSC_LINK: ${{ secrets.CSC_LINK }}
  CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
  MAKA_SIGNING_REQUIRED: "1"
run: npm run dist:signed
```

Upload `dist-installer/Maka-Setup-*.exe` to GitHub Releases.

---

## Site manifest

After a signed release, update `site/browser-manifest.json`:

```json
{
  "signed": true,
  "signing": {
    "publisher": "Your Org Name",
    "timestampServer": "http://timestamp.digicert.com",
    "algorithm": "sha256"
  }
}
```

Run `node scripts/update-browser-manifest.mjs` (added with signing scripts) to refresh SHA/size from the built installer.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `signtool not found` | Install Windows SDK; add `...\Windows Kits\10\bin\10.0.xxxxx.0\x64` to PATH |
| `No certificates were found` | Wrong PFX password or expired cert |
| SmartScreen still warns | New cert — reputation builds with download volume; EV helps |
| Relay unsigned in installer | Run `npm run sign:relay` before `dist`, or use `dist:signed` |
| Build fails with signing error | Unset `MAKA_SIGNING_REQUIRED` for local unsigned builds |

---

## Security

- **Never** commit `.pfx`, passwords, or `.env.signing.local`
- Rotate CI secrets when cert renews
- Prefer EV + hardware token for production org signing
