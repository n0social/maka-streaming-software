#!/usr/bin/env python3
"""Generate Tabcast Browser marketing PNGs (Play Store / Chrome Web Store style)."""
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

CYAN = (42, 245, 255)
PINK = (255, 42, 212)
LIME = (198, 255, 42)
ORANGE = (255, 122, 42)
BG = (10, 14, 20)
BG2 = (16, 21, 29)
INK = (242, 244, 246)
MUTED = (147, 157, 168)


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
            glow = max(0, 1 - d1 / (w * 0.55)) * 0.18 + max(0, 1 - d2 / (w * 0.5)) * 0.14
            r = min(255, int(BG[0] + CYAN[0] * glow))
            g = min(255, int(BG[1] + CYAN[1] * glow * 0.6 + PINK[1] * glow * 0.4))
            b = min(255, int(BG[2] + CYAN[2] * glow * 0.5 + PINK[2] * glow * 0.3))
            px[x, y] = (r, g, b, 255)
    return im


def draw_icon(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = max(2, size // 16)
    radius = max(4, size // 5)
    # Pin tile with gradient approximation
    for y in range(pad, size - pad):
        for x in range(pad, size - pad):
            t = (x - pad) / max(1, size - 2 * pad)
            r = int(CYAN[0] * (1 - t) + PINK[0] * t)
            g = int(CYAN[1] * (1 - t) + PINK[1] * t)
            b = int(CYAN[2] * (1 - t) + PINK[2] * t)
            if (x - pad) ** 2 + (y - pad) ** 2 < (size - 2 * pad) ** 2:
                im.putpixel((x, y), (r, g, b, 255))
    d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, outline=(255, 255, 255, 40))
    f = font(bold=True, size=max(10, int(size * 0.52)))
    text = "T"
    bbox = d.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(
        ((size - tw) // 2 - bbox[0], (size - th) // 2 - bbox[1] - size // 32),
        text,
        font=f,
        fill=BG,
    )
    return im


def draw_feature_graphic() -> Image.Image:
    w, h = 1024, 500
    im = hero_bg(w, h)
    d = ImageDraw.Draw(im)
    f_big = font(bold=True, size=92)
    f_tag = font(bold=True, size=22)
    f_sub = font(bold=False, size=20)
    d.text((72, 120), "TABCAST", font=f_big, fill=CYAN)
    d.text((72, 220), "LIVE · STUDIO · CAPTURE", font=f_tag, fill=LIME)
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


def main() -> None:
    print("Generating Tabcast marketing package…")
    icon_sizes = [16, 32, 48, 72, 96, 128, 192, 256, 512, 1024]
    master = draw_icon(1024)
    for s in icon_sizes:
        save_png(master.resize((s, s), Image.Resampling.LANCZOS), ICONS / f"icon-{s}.png")
        save_png(master.resize((s, s), Image.Resampling.LANCZOS), SITE / "icons" / f"icon-{s}.png")

    write_ico(OUT / "icons" / "icon.ico", [16, 32, 48, 64, 128, 256])

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
    save_png(master.resize((512, 512), Image.Resampling.LANCZOS), SITE / "icons" / "icon-512.png")
    save_png(master.resize((192, 192), Image.Resampling.LANCZOS), SITE / "apple-touch-icon.png")
    save_png(master.resize((32, 32), Image.Resampling.LANCZOS), SITE / "favicon-32.png")

    manifest = {
        "product": "Tabcast Browser",
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
