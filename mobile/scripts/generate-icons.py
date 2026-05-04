"""
Generate the master 1024x1024 iOS/Android app icon and the splash screens
from the existing SpecialCarer logo mark.

Requirements: CairoSVG + Pillow (already installed in the dev sandbox).

iOS app icons MUST NOT have an alpha channel — Apple rejects RGBA PNGs
at App Store Connect. We composite the heart mark onto a solid brand
teal background, then save as RGB.

Outputs:
  mobile/resources/icon.png            (1024x1024, brand teal background)
  mobile/resources/icon-foreground.png (1024x1024 transparent — Android adaptive)
  mobile/resources/icon-background.png (1024x1024 solid teal — Android adaptive)
  mobile/resources/splash.png          (2732x2732 light, brand teal)
  mobile/resources/splash-dark.png     (2732x2732 dark, near-black with logo)

These five files are the standard input set for `@capacitor/assets`,
which generates every iOS / Android variant automatically.
"""

import re
from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SVG_PATH = ROOT / "public" / "brand" / "logo-mark.svg"
OUT_DIR = ROOT / "mobile" / "resources"
OUT_DIR.mkdir(parents=True, exist_ok=True)

BRAND = (3, 158, 160)          # #039EA0
DARK = (15, 23, 42)             # slate-900
WHITE = (255, 255, 255)

ICON_SIZE = 1024
SPLASH_SIZE = 2732


def render_svg(svg_text: str, size: int) -> Image.Image:
    """Render an SVG string to a transparent RGBA PIL image of (size, size).

    The source mark uses viewBox '20 8 120 75' (wider than tall), which when
    forced into a square comes out small and bottom-heavy. We rewrite the
    viewBox to a tight square crop around the artwork before rasterising so
    the mark fills the icon canvas evenly.
    """
    # Square crop centered on the actual artwork.
    # The mark's drawn pixels span roughly x=22..138 (width 116) and
    # y=10..72 (height 62) in the original viewBox '20 8 120 75'.
    # Artwork center is therefore (80, 41). To get a tight, vertically
    # centred square we extend by 60 in each direction -> 'x=20 y=-19 w=120 h=120'.
    cropped = re.sub(
        r'viewBox="[^"]*"',
        'viewBox="20 -19 120 120"',
        svg_text,
        count=1,
    )
    png_bytes = cairosvg.svg2png(
        bytestring=cropped.encode("utf-8"),
        output_width=size,
        output_height=size,
    )
    return Image.open(BytesIO(png_bytes)).convert("RGBA")


def colourise(mark: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """Replace every non-transparent pixel with the given RGB, preserving alpha."""
    # The source SVG has no fill (stroke only). Anti-aliased rendering gives
    # us a clean alpha channel; we just paint solid colour through it.
    r, g, b = rgb
    alpha = mark.split()[-1]
    solid = Image.new("RGBA", mark.size, (r, g, b, 0))
    solid.putalpha(alpha)
    return solid


def make_icon_with_background(mark: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    """Composite mark centered on a solid background, return RGB (no alpha)."""
    canvas = Image.new("RGB", (ICON_SIZE, ICON_SIZE), bg)
    # Scale mark to ~70% of canvas (within Apple's safe area for icon artwork)
    target = int(ICON_SIZE * 0.70)
    resized = mark.resize((target, target), Image.LANCZOS)
    offset = ((ICON_SIZE - target) // 2, (ICON_SIZE - target) // 2)
    canvas.paste(resized, offset, resized)
    return canvas


def make_splash(bg: tuple[int, int, int], mark: Image.Image) -> Image.Image:
    canvas = Image.new("RGB", (SPLASH_SIZE, SPLASH_SIZE), bg)
    target = int(SPLASH_SIZE * 0.30)
    resized = mark.resize((target, target), Image.LANCZOS)
    offset = ((SPLASH_SIZE - target) // 2, (SPLASH_SIZE - target) // 2)
    canvas.paste(resized, offset, resized)
    return canvas


def main() -> None:
    svg_text = SVG_PATH.read_text(encoding="utf-8")
    raw_mark = render_svg(svg_text, ICON_SIZE)

    # Variants of the mark in different colours
    mark_white = colourise(raw_mark, WHITE)
    mark_teal = colourise(raw_mark, BRAND)

    # 1) Main iOS icon — teal bg, white mark, NO alpha
    icon = make_icon_with_background(mark_white, BRAND)
    icon.save(OUT_DIR / "icon.png", "PNG", optimize=True)

    # 2) Android adaptive icon — separate fg (transparent) + bg (solid teal)
    fg_canvas = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    target = int(ICON_SIZE * 0.55)  # adaptive icons crop more aggressively
    resized = mark_white.resize((target, target), Image.LANCZOS)
    offset = ((ICON_SIZE - target) // 2, (ICON_SIZE - target) // 2)
    fg_canvas.paste(resized, offset, resized)
    fg_canvas.save(OUT_DIR / "icon-foreground.png", "PNG", optimize=True)

    bg_canvas = Image.new("RGB", (ICON_SIZE, ICON_SIZE), BRAND)
    bg_canvas.save(OUT_DIR / "icon-background.png", "PNG", optimize=True)

    # 3) Splash screens
    splash_light = make_splash(BRAND, mark_white)
    splash_light.save(OUT_DIR / "splash.png", "PNG", optimize=True)

    splash_dark = make_splash(DARK, mark_teal)
    splash_dark.save(OUT_DIR / "splash-dark.png", "PNG", optimize=True)

    # Sanity report
    for name in (
        "icon.png",
        "icon-foreground.png",
        "icon-background.png",
        "splash.png",
        "splash-dark.png",
    ):
        path = OUT_DIR / name
        with Image.open(path) as im:
            print(f"  {name:24s} {im.size[0]}x{im.size[1]}  mode={im.mode}")


if __name__ == "__main__":
    main()
