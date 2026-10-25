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

Same assets copied for deployment to `tabcast.live.skydav.work/marketing/`.

## Design language

CREW Neon Four on Court Black — cyan `#2AF5FF`, pink `#FF2AD4`, lime `#C6FF2A`, orange `#FF7A2A`, background `#0A0E14`.

## Deploy site

```bash
bash site/deploy-site.sh
```

Publishes:

- `/` — Maka landing (`site/index.html`)
- `/legacy.html` — Relay + web studio workflow
- `/stream/` — Legacy SPA web studio
- `/marketing/*` — Icons, feature graphic, download badges
- `/downloads/Maka-Setup-<version>.exe` — Windows studio installer (upload after each release; see `site/browser-manifest.json`)
