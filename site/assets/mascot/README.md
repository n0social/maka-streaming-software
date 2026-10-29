# Maka mascot assets

Original character art for the **Maka** streaming studio brand: a chibi student streamer with cream-and-gold studio colors and abstract star / arc motifs. Evokes determined anime-protagonist energy without copying any licensed character — **not** affiliated with *Soul Eater*, BONES, or other franchises.

## Files

| File | Use |
|------|-----|
| `maka-mascot.svg` | **Primary** vector (256×256 viewBox). Hero, corner decoration, source for PNG exports. |
| `export-png.sh` | Renders `maka-mascot-48.png` and `maka-mascot-256.png` via `@resvg/resvg-js` (Node/npm). |
| `preview.html` | Local scale check (48px vs 256px on cream `#faf8f4`). |

PNG exports live in `marketing/icons/` after running the script from the repo root.

## Palette

| Token | Hex | Usage |
|-------|-----|--------|
| Cream | `#faf8f4` | Blazer, highlights |
| Mikado Yellow | `#ffc40c` | Trim, star, hair highlights, mic |
| Ink | `#2a2418` | Outlines, eyes, hair line art |

Supporting tints: skin `#f5e8dc`, hair gradient `#f0e2c4` → `#ffc40c`.

## Usage on site

- Hero: `/assets/mascot/maka-mascot.png` — full anime illustration (1024×1024 RGBA, background removed for cream hero). Source raster from commit `e4f4fa0`; do not replace with SVG/chibi export for the home hero.
- Corner: `/assets/mascot/maka-mascot.svg` on download, stream, and preview pages (`.mascot-corner`)
- Legacy URL: `/maka-mascot.svg` (mirrored on deploy)

## Favicon

Keep the gold **M** tile under `site/marketing/` for favicons. Use exported `maka-mascot-48.png` only if you intentionally switch to a mascot favicon.

## Legal

Do not replace this art with official *Soul Eater* screenshots, model sheets, or logo marks. Keep edits in this folder so licensing stays clear (MIT project, original mascot).
