#!/usr/bin/env python3
"""
Generate iOS / Android splash assets for Capacitor from the SpecialCarer
wordmark logo.

Outputs (2732x2732 — Capacitor standard):
  - mobile/resources/splash.png        light variant (white bg)
  - mobile/resources/splash-dark.png   dark variant (teal bg, white logo)

Why 2732x2732?
  capacitor-assets requires a square master at least 2732px so it can
  generate every iOS Universal storyboard size (and Android density buckets)
  without upscaling. The logo itself is sized to ~38% of the canvas width
  so it shows comfortably on the smallest device (iPhone SE) and the
  largest tablet (iPad Pro 12.9") without the wordmark text getting too
  small or running off-screen on rotation.
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
SRC_LOGO = REPO / "public" / "brand" / "logo-wordmark-email.png"
OUT_DIR = REPO / "mobile" / "resources"

CANVAS = 2732
LOGO_RATIO = 0.42   # logo width = 42% of canvas
TEAL = (3, 158, 160, 255)        # brand #039EA0
WHITE = (255, 255, 255, 255)


def load_logo() -> Image.Image:
    """Load wordmark and trim transparent margin so the visible bbox is
    what we center on the canvas (the source PNG has padding below)."""
    logo = Image.open(SRC_LOGO).convert("RGBA")
    bbox = logo.getbbox()
    if bbox:
        logo = logo.crop(bbox)
    return logo


def fit_logo(logo: Image.Image, target_width: int) -> Image.Image:
    w, h = logo.size
    scale = target_width / w
    return logo.resize((target_width, int(h * scale)), Image.LANCZOS)


def tint_to_white(logo: Image.Image) -> Image.Image:
    """Replace all opaque pixels with white, preserve alpha."""
    r, g, b, a = logo.split()
    white = Image.new("L", logo.size, 255)
    return Image.merge("RGBA", (white, white, white, a))


def compose(bg_color: tuple[int, int, int, int], logo: Image.Image, out: Path) -> None:
    canvas = Image.new("RGBA", (CANVAS, CANVAS), bg_color)
    target_w = int(CANVAS * LOGO_RATIO)
    sized = fit_logo(logo, target_w)
    x = (CANVAS - sized.width) // 2
    y = (CANVAS - sized.height) // 2
    canvas.alpha_composite(sized, (x, y))
    canvas.convert("RGB").save(out, "PNG", optimize=True)
    print(f"  wrote {out.relative_to(REPO)}  ({canvas.size[0]}x{canvas.size[1]})")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    logo = load_logo()
    print(f"source logo: {SRC_LOGO.relative_to(REPO)}  {logo.size}")

    # Light: brand teal logo on white
    compose((255, 255, 255, 255), logo, OUT_DIR / "splash.png")

    # Dark: white logo on teal
    compose(TEAL, tint_to_white(logo), OUT_DIR / "splash-dark.png")

    print("done.")


if __name__ == "__main__":
    main()
