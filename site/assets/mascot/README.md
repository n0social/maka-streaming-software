# Maka mascot assets

Original character art for the **Maka** streaming studio brand. The design is a chibi student streamer with cream-and-gold studio colors and abstract star / arc motifs — **not** traced from or affiliated with *Soul Eater*, BONES, or any other third-party franchise.

## Files

| File | Use |
|------|-----|
| `maka-mascot.svg` | Primary vector (256×256 viewBox). Site corner decoration, hero embeds, source for PNG exports. |
| `export-png.sh` | Renders `maka-mascot-48.png` and `maka-mascot-256.png` via `@resvg/resvg-js` (requires Node/npm). |

PNG outputs land in `marketing/icons/` when you run the export script from the repo root.

## Palette

| Token | Hex | Usage |
|-------|-----|--------|
| Cream | `#faf8f4` | Blazer, highlights |
| Gold | `#c9a227` | Trim, star, hair highlights, mic |
| Ink | `#2a2418` | Outlines, eyes, hair line art |

Supporting tints in the SVG: skin `#f5e8dc`, hair gradient `#f0e2c4` → `#c9a227`.

## Usage on site

MVP pages reference `/assets/mascot/maka-mascot.svg` in the fixed `.mascot-corner` slot. A copy at `/maka-mascot.svg` remains for older links and deploy scripts that still mirror the root file.

## Favicon

App favicons stay the gold **M** tile under `site/marketing/`. The mascot is decorative at ~48px in the corner; at favicon size the face detail is optional — use `maka-mascot-48.png` from exports if you want a mascot favicon later.

## Legal

Do not replace this art with official *Soul Eater* screenshots, model sheets, or logo marks. Keep edits in this folder so licensing stays clear (MIT project, original mascot).
