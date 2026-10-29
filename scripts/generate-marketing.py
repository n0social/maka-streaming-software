#!/usr/bin/env python3
"""Generate Maka marketing PNGs (Play Store / Chrome Web Store style)."""
from __future__ import annotations

import json
import struct
import zlib
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "marketing"
ICONS = OUT / "icons"
STORE = OUT / "store"
BADGES = OUT / "badges"
SITE = ROOT / "site" / "marketing"
RESOURCES = ROOT / "resources" / "icons"

CYAN = (200, 200, 208)  # silver highlight
PINK = (232, 220, 200)  # champagne
LIME = (240, 215, 140)  # gold light
ORANGE = (212, 175, 55)  # gold
BG = (17, 17, 20)
BG2 = (26, 26, 31)
INK = (250, 250, 250)
MUTED = (142, 142, 154)
GOLD = (212, 175, 55)
GOLD_LIGHT = (240, 215, 140)
SILVER = (200, 200, 208)


def font(bold=False, size=32):
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="PNG", optimize=True)
    print(f"  {path.relative_to(ROOT)}  ({path.stat().st_size // 1024} KB)")


def hero_bg(w: int, h: int) -> Image.Image:
    im = Image.new("RGBA", (w, h), BG + (255,))
    px = im.load()
    cx1, cy1 = int(w * 0.15), int(h * -0.1)
    cx2, cy2 = int(w * 0.95), int(h * 0.05)
    for y in range(h):
        for x in range(w):
            d1 = ((x - cx1) ** 2 + (y - cy1) ** 2) ** 0.5
            d2 = ((x - cx2) ** 2 + (y - cy2) ** 2) ** 0.5
            glow = max(0, 1 - d1 / (w * 0.55)) * 0.14 + max(0, 1 - d2 / (w * 0.5)) * 0.1
            r = min(255, int(BG[0] + GOLD[0] * glow))
            g = min(255, int(BG[1] + GOLD[1] * glow * 0.85 + SILVER[1] * glow * 0.15))
            b = min(255, int(BG[2] + GOLD[2] * glow * 0.5 + SILVER[2] * glow * 0.2))
            px[x, y] = (r, g, b, 255)
    return im


# Favicon tile: brighter cream → Mikado, matching the hero. The M is League Spartan
# Black, sheared to the same synthetic italic the wordmark uses (the family has no italic file).
CREAM_BRIGHT = (255, 248, 228)
MIKADO = (255, 196, 12)
INK = (26, 20, 8)
MAKA_FONT = ROOT / "scripts" / "fonts" / "LeagueSpartan-900.ttf"
ITALIC_SHEAR = 0.25


def maka_font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(MAKA_FONT), size)


def slant_italic(layer: Image.Image, shear: float = ITALIC_SHEAR) -> Image.Image:
    width, height = layer.size
    pad = int(abs(shear) * height) + 4
    canvas = Image.new("RGBA", (width + pad, height), (0, 0, 0, 0))
    canvas.paste(layer, (0, 0), layer)
    slanted = canvas.transform(
        canvas.size,
        Image.Transform.AFFINE,
        (1, shear, -shear * (height - 1), 0, 1, 0),
        resample=Image.Resampling.BICUBIC,
    )
    box = slanted.split()[-1].getbbox()
    return slanted.crop(box) if box else slanted


def draw_icon(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = max(2, size // 16)
    radius = max(4, size // 5)
    inner = size - 2 * pad
    for y in range(pad, size - pad):
        for x in range(pad, size - pad):
            if (x - pad) ** 2 + (y - pad) ** 2 < inner ** 2:
                t = (x - pad) / max(1, inner)
                r = int(CREAM_BRIGHT[0] * (1 - t) + MIKADO[0] * t)
                g = int(CREAM_BRIGHT[1] * (1 - t) + MIKADO[1] * t)
                b = int(CREAM_BRIGHT[2] * (1 - t) + MIKADO[2] * t)
                im.putpixel((x, y), (r, g, b, 255))
    d.rounded_rectangle(
        [pad, pad, size - pad - 1, size - pad - 1],
        radius=radius,
        outline=(255, 255, 255, 90),
    )
    face = maka_font(max(10, int(size * 0.62)))
    bbox = d.textbbox((0, 0), "M", font=face)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    layer = Image.new("RGBA", (tw + 8, th + 8), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text(
        (-bbox[0] + 4, -bbox[1] + 4),
        "M",
        font=face,
        fill=INK + (255,),
    )
    glyph = slant_italic(layer)
    im.alpha_composite(
        glyph,
        ((size - glyph.size[0]) // 2, (size - glyph.size[1]) // 2 - size // 48),
    )
    return im


def draw_feature_graphic() -> Image.Image:
    w, h = 1024, 500
    im = hero_bg(w, h)
    d = ImageDraw.Draw(im)
    f_big = font(bold=True, size=92)
    f_tag = font(bold=True, size=22)
    f_sub = font(bold=False, size=20)
    d.text((72, 120), "TABCAST", font=f_big, fill=GOLD)
    d.text((72, 220), "LIVE · STUDIO · CAPTURE", font=f_tag, fill=GOLD_LIGHT)
    d.text(
        (72, 270),
        "Chromium studio + local relay.\nGo live without OBS.",
        font=f_sub,
        fill=MUTED,
    )
    # App window mock
    wx, wy, ww, wh = 620, 70, 340, 360
    d.rounded_rectangle([wx, wy, wx + ww, wy + wh], radius=24, fill=BG2 + (240,), outline=CYAN + (120,))
    d.rounded_rectangle([wx + 16, wy + 16, wx + ww - 16, wy + 56], radius=12, fill=(255, 255, 255, 18))
    d.ellipse([wx + 28, wy + 30, wx + 44, wy + 46], fill=LIME)
    d.rounded_rectangle([wx + 16, wy + 72, wx + ww - 16, wy + wh - 16], radius=16, fill=(5, 7, 10, 255))
    d.rounded_rectangle(
        [wx + ww - 110, wy + wh - 90, wx + ww - 28, wy + wh - 28],
        radius=10,
        outline=CYAN + (200,),
        width=2,
    )
    d.text((wx + 28, wy + 28), "● LIVE", font=font(bold=True, size=14), fill=LIME)
    return im


def draw_phone_screenshot() -> Image.Image:
    w, h = 1080, 1920
    im = hero_bg(w, h)
    d = ImageDraw.Draw(im)
    d.text((80, 120), "TABCAST", font=font(bold=True, size=72), fill=CYAN)
    d.text((80, 210), "Studio", font=font(bold=True, size=36), fill=INK)
    d.rounded_rectangle([60, 280, w - 60, h - 420], radius=32, fill=BG2 + (255,), outline=(255, 255, 255, 30))
    d.rounded_rectangle([90, 320, w - 90, h - 680], radius=20, fill=(5, 7, 10, 255))
    d.rounded_rectangle([w - 280, h - 640, w - 110, h - 470], radius=14, outline=LIME + (220,), width=3)
    d.text((90, h - 360), "Go Live", font=font(bold=True, size=28), fill=BG)
    d.rounded_rectangle([90, h - 300, w - 90, h - 220], radius=999, fill=CYAN)
    d.text((w // 2 - 80, h - 288), "DOWNLOAD", font=font(bold=True, size=24), fill=BG)
    return im


def draw_desktop_screenshot() -> Image.Image:
    w, h = 1280, 800
    im = hero_bg(w, h)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([40, 40, w - 40, h - 40], radius=20, fill=BG2 + (255,), outline=(255, 255, 255, 25))
    d.rounded_rectangle([40, 40, w - 40, 88], radius=20, fill=(255, 255, 255, 12))
    d.text((60, 52), "TABCAST  ·  Studio", font=font(bold=True, size=22), fill=CYAN)
    d.rounded_rectangle([60, 110, 300, h - 60], radius=16, fill=(255, 255, 255, 8))
    d.rounded_rectangle([320, 110, w - 320, h - 60], radius=16, fill=(5, 7, 10, 255), outline=CYAN + (80,))
    d.rounded_rectangle([w - 280, 110, w - 60, h - 60], radius=16, fill=(255, 255, 255, 8))
    d.rounded_rectangle([w - 520, h - 220, w - 360, h - 100], radius=12, outline=LIME + (200,), width=2)
    return im


def draw_download_badge(label: str = "DOWNLOAD NOW", width: int = 640, height: int = 120) -> Image.Image:
    im = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for y in range(height):
        t = y / max(1, height - 1)
        r = int(CYAN[0] * (1 - t * 0.2) + PINK[0] * (t * 0.8))
        g = int(CYAN[1] * (1 - t * 0.2) + PINK[1] * (t * 0.8))
        b = int(CYAN[2] * (1 - t * 0.2) + PINK[2] * (t * 0.8))
        d.line([(0, y), (width, y)], fill=(r, g, b, 255))
    d.rounded_rectangle([0, 0, width - 1, height - 1], radius=height // 2, outline=(255, 255, 255, 60))
    f = font(bold=True, size=36)
    bbox = d.textbbox((0, 0), label, font=f)
    tw = bbox[2] - bbox[0]
    d.text(((width - tw) // 2, (height - 36) // 2), label, font=f, fill=BG)
    return im


def draw_promo_tile() -> Image.Image:
    w, h = 440, 280
    im = hero_bg(w, h)
    d = ImageDraw.Draw(im)
    icon = draw_icon(96)
    im.paste(icon, (32, 92), icon)
    d.text((150, 100), "TABCAST", font=font(bold=True, size=36), fill=CYAN)
    d.text((150, 145), "Browser", font=font(bold=True, size=24), fill=INK)
    d.text((150, 180), "Studio + Relay", font=font(bold=False, size=16), fill=MUTED)
    return im


def draw_marquee() -> Image.Image:
    w, h = 1400, 560
    im = hero_bg(w, h)
    d = ImageDraw.Draw(im)
    d.text((80, 180), "TABCAST BROWSER", font=font(bold=True, size=64), fill=CYAN)
    d.text((80, 270), "Capture · Layout · Go Live", font=font(bold=True, size=28), fill=LIME)
    icon = draw_icon(200)
    im.paste(icon, (1050, 180), icon)
    return im


def write_ico(path: Path, sizes: list[int]) -> None:
    images = [draw_icon(s) for s in sizes]
    header = struct.pack("<HHH", 0, 1, len(images))
    offset = 6 + 16 * len(images)
    entries = b""
    payload = b""
    for s, im in zip(sizes, images):
        buf = BytesIO()
        im.save(buf, format="PNG")
        data = buf.getvalue()
        w = 0 if s >= 256 else s
        entries += struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(data), offset)
        payload += data
        offset += len(data)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(header + entries + payload)


def export_icons(master: Image.Image) -> None:
    icon_sizes = [16, 32, 48, 72, 96, 128, 192, 256, 512, 1024]
    for s in icon_sizes:
        save_png(master.resize((s, s), Image.Resampling.LANCZOS), ICONS / f"icon-{s}.png")
        save_png(master.resize((s, s), Image.Resampling.LANCZOS), SITE / "icons" / f"icon-{s}.png")
    write_ico(OUT / "icons" / "icon.ico", [16, 32, 48, 64, 128, 256])
    save_png(master.resize((512, 512), Image.Resampling.LANCZOS), SITE / "icons" / "icon-512.png")
    save_png(master.resize((192, 192), Image.Resampling.LANCZOS), SITE / "apple-touch-icon.png")
    save_png(master.resize((32, 32), Image.Resampling.LANCZOS), SITE / "favicon-32.png")
    for s in [16, 24, 32, 48, 64, 128, 256]:
        save_png(master.resize((s, s), Image.Resampling.LANCZOS), RESOURCES / f"icon-{s}.png")
    save_png(master.resize((16, 16), Image.Resampling.LANCZOS), RESOURCES / "tray.png")
    save_png(master.resize((32, 32), Image.Resampling.LANCZOS), RESOURCES / "tray@2x.png")
    write_ico(RESOURCES / "icon.ico", [16, 24, 32, 48, 64, 128, 256])


def main() -> None:
    import sys

    if "--icons-only" in sys.argv:
        print("Generating Maka M icons…")
        export_icons(draw_icon(1024))
        print("Done.")
        return

    print("Generating Maka marketing package…")
    icon_sizes = [16, 32, 48, 72, 96, 128, 192, 256, 512, 1024]
    export_icons(draw_icon(1024))

    save_png(draw_feature_graphic(), STORE / "feature-graphic-1024x500.png")
    save_png(draw_phone_screenshot(), STORE / "screenshot-phone-1080x1920.png")
    save_png(draw_desktop_screenshot(), STORE / "screenshot-desktop-1280x800.png")
    save_png(draw_promo_tile(), STORE / "promo-tile-440x280.png")
    save_png(draw_marquee(), STORE / "marquee-1400x560.png")
    save_png(draw_download_badge("DOWNLOAD NOW"), BADGES / "download-now.png")
    save_png(draw_download_badge("FOR WINDOWS", width=520, height=100), BADGES / "download-for-windows.png")

    # Site-friendly copies
    for name in [
        "feature-graphic-1024x500.png",
        "screenshot-desktop-1280x800.png",
        "promo-tile-440x280.png",
    ]:
        src = STORE / name
        dst = SITE / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(src.read_bytes())

    save_png(draw_download_badge("DOWNLOAD NOW"), SITE / "download-now.png")

    manifest = {
        "product": "Maka",
        "version": "0.2.0",
        "generatedBy": "scripts/generate-marketing.py",
        "icons": {f"icon-{s}.png": f"{s}x{s}" for s in icon_sizes},
        "store": {
            "feature-graphic-1024x500.png": "Google Play feature graphic",
            "screenshot-phone-1080x1920.png": "Phone screenshot (portrait)",
            "screenshot-desktop-1280x800.png": "Desktop / Chrome Web Store screenshot",
            "promo-tile-440x280.png": "Chrome Web Store small promo tile",
            "marquee-1400x560.png": "Chrome Web Store marquee / hero",
        },
        "badges": {
            "download-now.png": "Primary CTA badge for landing pages",
            "download-for-windows.png": "Windows-specific download badge",
        },
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("Done.")


if __name__ == "__main__":
    main()
