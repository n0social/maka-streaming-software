# Maka mascot assets

Original **anime-style** character art for the **Maka** streaming studio brand: a warm, studious stream-host look with **platinum white-blonde** hair, **professional + gamer** outfit, and cream-and-gold studio colors (`#faf8f4`, `#c9a227`). Fan-inspired by the “studious heroine” / Maka Albarn *archetype* — **not** traced from, affiliated with, or depicting *Soul Eater*, BONES, or any other third-party franchise.

## Character design (current)

| Element | Direction |
|---------|-----------|
| Hair | White-blonde / platinum; straight blunt bangs; shoulder-length with small pigtails; subtle ahoge |
| Face | Large anime eyes (green or brown), friendly smile, light blush |
| Outfit | White button-up shirt under **black thin-strap shortalls** (sleek overall dress, not bulky work overalls) |
| Accents | Small gold star pin, cream/gold trim (`#c9a227`); gaming headset (black + gold) |
| Framing | Half-body or bust, cel-shaded illustration on cream `#faf8f4` (or soft gradient) |

Primary raster: **`maka-mascot.png`** (1024×1024). Regenerate marketing sizes with `export-png.sh` after replacing the PNG.

## Files

| File | Use |
|------|-----|
| `maka-mascot.png` | **Primary** illustration (1024×1024). Hero embeds, corner decoration, source for PNG exports. |
| `maka-mascot.svg` | Optional secondary vector (256×256 viewBox) for crisp tiny scales or legacy links. |
| `export-png.sh` | Renders `maka-mascot-48.png`, `maka-mascot-256.png`, and `maka-mascot-512.png` from the primary PNG. |
| `preview.html` | Local scale check (48px vs 256px on cream `#faf8f4`). |

PNG outputs land in `marketing/icons/` when you run the export script from the repo root.

## Palette

| Token | Hex | Usage |
|-------|-----|--------|
| Cream | `#faf8f4` | Background, shirt highlights |
| Gold | `#c9a227` | Trim, star pin, headset accents |
| Ink | `#2a2418` | Outlines, hair line art |
| Overalls | `#1a1a1a` | Thin-strap shortalls |

Supporting tints in art: skin `#f5e8dc`, hair `#f5f0e8` → `#e8dcc8` with gold highlights.

## Usage on site

Landing pages use `/assets/mascot/maka-mascot.png` (or `.svg` where vector is preferred) in a fixed `.mascot-corner` slot. A mirror at `/maka-mascot.svg` is copied on deploy for older links.

## Favicon

App favicons remain the gold **M** tile under `site/marketing/`. The mascot is decorative at ~48px; use exported `maka-mascot-48.png` if you switch to a mascot favicon later.

## Legal

Do not replace this art with official *Soul Eater* screenshots, model sheets, or logo marks. Keep edits in this folder so licensing stays clear (MIT project, original mascot).
