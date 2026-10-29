# Maka — Marketing Package

Generated assets for store listings, landing pages, and portfolio use.  
Regenerate anytime:

```bash
python scripts/generate-marketing.py
```

## Icons (`marketing/icons/`)

| File | Size | Use |
|------|------|-----|
| `icon-512.png` | 512×512 | Google Play high-res icon |
| `icon-192.png` | 192×192 | PWA / Android adaptive |
| `icon-128.png` | 128×128 | Chrome Web Store extension icon |
| `icon-48.png` | 48×48 | Windows / favicon |
| `icon-16.png` … `icon-1024.png` | various | Full export set |
| `icon.ico` | multi-size | Windows installer / shell |

## Store graphics (`marketing/store/`)

| File | Dimensions | Use |
|------|------------|-----|
| `feature-graphic-1024x500.png` | 1024×500 | **Google Play feature graphic** |
| `screenshot-phone-1080x1920.png` | 1080×1920 | Phone screenshot (portrait) |
| `screenshot-desktop-1280x800.png` | 1280×800 | Desktop / Chrome Web Store screenshot |
| `promo-tile-440x280.png` | 440×280 | Chrome Web Store small promo tile |
| `marquee-1400x560.png` | 1400×560 | Chrome Web Store marquee |

## Badges (`marketing/badges/`)

| File | Use |
|------|-----|
| `download-now.png` | Primary CTA badge for landing pages |
| `download-for-windows.png` | Windows-specific download pill |

## Site copies (`site/marketing/`)

Same assets copied for deployment to [makalive.stream/marketing/](https://makalive.stream/marketing/).

## Design language

CREW Neon Four on Court Black — cyan `#2AF5FF`, pink `#FF2AD4`, lime `#C6FF2A`, orange `#FF7A2A`, background `#0A0E14`.

## Production host (DigitalOcean)

The public site is **[https://makalive.stream](https://makalive.stream)**. Files deploy to **`/opt/tabcast/web`** on the same droplet as **`skydav.work`** (portfolio Next.js). Repo does not store DO API keys or SSH keys — deploy is manual from your machine.

| Host | Role |
|------|------|
| `104.131.164.94` | nginx + Maka static site + portfolio app |
| [makalive.stream](https://makalive.stream) | Maka landing, downloads, legacy `/stream/` |
| `skydav.work` | Portfolio (not in this repo) |

**Check RAM and disk** (run with your SSH key):

```bash
ssh root@104.131.164.94 'free -h; df -h; du -sh /opt/tabcast/web /var/www 2>/dev/null'
```

Typical headroom: static site + Next portfolio fits a **2 GB / 50 GB** droplet; add disk for each mirrored installer (~190 MB) and `MAKArelay.exe` (~400 MB). The encoder on the server is for **download only** — live encoding still runs on the streamer’s PC (`127.0.0.1:38473`).

If **`/downloads/Maka-Setup-0.2.5.exe`** returns HTML instead of an `.exe`, upload the file to `/tmp/tabcast-upload/` and run **`deploy-download.sh`** (see below), or point users at the [v0.2.5 GitHub Release](https://github.com/n0social/maka-streaming-software/releases/tag/v0.2.5) until the mirror is updated.

## Deploy site

```bash
bash site/deploy-site.sh
```

Publishes:

- `/` — Maka landing (`site/index.html`)
- `/legacy.html` — Relay + web studio workflow
- `/stream/` — Legacy SPA web studio
- `/marketing/*` — Icons, feature graphic, download badges
- `/downloads/MAKArelay.exe` — encoder download (`MAKArelay.exe`)
- `/downloads/Maka-Setup-0.2.5.exe` — current Windows installer
