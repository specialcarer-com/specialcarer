"""
Regenerate mobile splash assets using the canonical Special Carers wordmark logo.

Outputs:
  mobile/resources/splash.png                                   (2732x2732 brand teal + white logo)
  mobile/resources/splash-dark.png                              (2732x2732 dark slate + teal logo)
  mobile/ios-overlay/.../SplashScreen.imageset/splash@1x.png    (430x932 portrait)
  mobile/ios-overlay/.../SplashScreen.imageset/splash@2x.png    (860x1864 portrait)
  mobile/ios-overlay/.../SplashScreen.imageset/splash@3x.png    (1290x2796 portrait)

The Capacitor splash.png is the master 2732x2732 canvas Capacitor uses to
derive all device sizes. The iOS overlay assets are the storyboard fallbacks.

Sources:
  public/brand/logo-white.svg  -> white-on-transparent (for teal backgrounds)
  public/brand/logo.svg        -> teal-on-transparent (for dark backgrounds)

Both source SVGs contain the full composition (hands + heart + cross + house +
family + wheelchair + baseline) AND the "Special Carers" plural wordmark in
Plus Jakarta Sans 700.

NOTE: This script does NOT regenerate icon.png — that asset is the hand-
curated canonical hands+family-on-teal artwork (RGB no alpha, no wordmark).
See `generate-icons.py` for icon variants.

Requirements: CairoSVG + Pillow.
"""
from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
LIGHT_SVG = ROOT / "public" / "brand" / "logo-white.svg"
DARK_SVG = ROOT / "public" / "brand" / "logo.svg"
RESOURCES = ROOT / "mobile" / "resources"
IOS_DIR = (
    ROOT
    / "mobile"
    / "ios-overlay"
    / "App"
    / "App"
    / "Assets.xcassets"
    / "SplashScreen.imageset"
)

BRAND = (3, 158, 160)       # #039EA0
DARK_BG = (15, 23, 42)      # slate-900


def render(svg_path: Path, width: int) -> Image.Image:
    """Render an SVG to a transparent RGBA PIL image at the requested width."""
    png = cairosvg.svg2png(url=str(svg_path), output_width=width)
    return Image.open(BytesIO(png)).convert("RGBA")


def make_splash(
    bg: tuple[int, int, int],
    logo: Image.Image,
    canvas_w: int,
    canvas_h: int,
    logo_pct: float = 0.45,
) -> Image.Image:
    """Composite a logo centered on a solid-color canvas.

    logo_pct is the logo width as a fraction of min(canvas_w, canvas_h).
    """
    canvas = Image.new("RGB", (canvas_w, canvas_h), bg)
    target_w = int(min(canvas_w, canvas_h) * logo_pct)
    aspect = logo.size[1] / logo.size[0]
    target_h = int(target_w * aspect)
    resized = logo.resize((target_w, target_h), Image.LANCZOS)
    offset = ((canvas_w - target_w) // 2, (canvas_h - target_h) // 2)
    canvas.paste(resized, offset, resized)
    return canvas


def main() -> None:
    # Render source logos at high res once
    logo_white = render(LIGHT_SVG, 2400)
    logo_teal = render(DARK_SVG, 2400)

    # --- Capacitor master splash (2732x2732 square) ---
    splash_light = make_splash(BRAND, logo_white, 2732, 2732, logo_pct=0.45)
    splash_light.save(RESOURCES / "splash.png", "PNG", optimize=True)

    splash_dark = make_splash(DARK_BG, logo_teal, 2732, 2732, logo_pct=0.45)
    splash_dark.save(RESOURCES / "splash-dark.png", "PNG", optimize=True)

    # --- iOS storyboard splash variants (portrait) ---
    for scale in ("1x", "2x", "3x"):
        path = IOS_DIR / f"splash@{scale}.png"
        with Image.open(path) as im:
            w, h = im.size
        # portrait → use slightly larger logo proportion
        pct = 0.55 if h > w else 0.45
        splash = make_splash(BRAND, logo_white, w, h, logo_pct=pct)
        splash.save(path, "PNG", optimize=True)

    # Sanity report
    print("Regenerated:")
    for path in (
        RESOURCES / "splash.png",
        RESOURCES / "splash-dark.png",
        IOS_DIR / "splash@1x.png",
        IOS_DIR / "splash@2x.png",
        IOS_DIR / "splash@3x.png",
    ):
        with Image.open(path) as im:
            print(f"  {path.relative_to(ROOT)}: {im.size[0]}x{im.size[1]}  mode={im.mode}")


if __name__ == "__main__":
    main()
# Touch commit to retrigger Vercel build (build #1 stuck in Initializing).
