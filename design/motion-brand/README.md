# SpecialCarer Motion Brand

Canonical motion-brand reference for SpecialCarer. Use this whenever adding splash screens, hero animations, loading states, or onboarding intros across web, mobile-web, or iOS.

The two HTML files in this folder are the source of truth — they are pinned design specs from the SpecialCarer animated-logo brief. Do not modify them. Implementations live under `src/components/motion/`.

## Files

- `SpecialCarer-logo-animation.html` — **dark surface variant** (ink `#0F1416` backgrounds)
- `SpecialCarer-logo-animation-light.html` — **light surface variant** (white backgrounds)
- `SpecialCarer-logo-animation-transparent.html` — **transparent surface variant** (no stage; for compositing over photography, video, or coloured panels)
- `animations.jsx` — easing helpers (`Easing.easeOutBack`, `easeOutCubic`, `easeInOutCubic`, `easeOutQuad`) and utilities (`clamp`, `interpolate`, `animate`, `Stage`, `Sprite`, `useTime`)
- `assets/specialcarer-icon.svg` — pure icon (two carers + heart + foundation line, all teal)
- `assets/specialcarer-logo.svg` — icon + wordmark lockup

## Brand tokens

| Token | Hex | Usage |
|---|---|---|
| `teal` | `#039EA0` | Primary brand. Icon fill, wordmark colour. |
| `tealLo` | `#02787A` | Hover / pressed states. |
| `tealHi` | `#3FC6C8` | Highlights. Capital "C" pop in wordmark. |
| `cream` | `#F4EFE6` | Light foreground on dark surfaces (tagline text on dark). |
| `ink` | `#0F1416` | Dark foreground on light surfaces. Background of dark variant. |

## Type

| Element | Family | Weight | Style | Size | Tracking |
|---|---|---|---|---|---|
| Wordmark "SpecialCarer" | Plus Jakarta Sans | 700 | Italic | 110px @1080p | -0.025em |
| Tagline "CARE, 4 U" | Plus Jakarta Sans | 500 | Upright, uppercase | 22px @1080p | 0.32em |

The wordmark is **one word** ("SpecialCarer"). The capital "C" at index 7 receives a slight `tealHi` colour pop and a fading text-shadow as it lands.

## Timeline (6s, 1920×1080)

| Phase | Time | What |
|---|---|---|
| A — Icon entrance | 0.2 → 1.4s | Scale 0.6→1.0 (`easeOutBack`) + opacity 0→1 (`easeOutCubic`) |
| B — Brush sweep reveal | 0.4 → 1.8s | `linear-gradient(100deg, …)` mask travels left-to-right, `easeInOutCubic` |
| C₁ — Foundation line | 0 → 1.0s | Underline draws outward from centre with teal gradient stroke, `easeInOutCubic` |
| C₂ — Heart pulse | 1.7s + 2.05s | Two sine bursts (envelope), then sustained 2.4Hz soft pulse |
| C₃ — Heart halo | 1.5s+ | Radial-gradient bloom synced to heart pulse |
| D — Icon breathing | 2.0s+ | 1.6Hz scale ±1.2% |
| E — Wordmark | 2.1s + 0.045s/letter | Per-letter reveal: opacity, translateY 32→0, blur 10→0, `easeOutCubic` (0.55s each) |
| F — Tagline text | 3.4s | Fade + translateY 14→0 (`easeOutCubic`, 1.0s) |
| F — Tagline bars | 3.6s | Two side bars draw outward from text (`easeInOutCubic`, 0.8s) |
| G — Camera breathing | 4.0s+ | Whole composition 1.4Hz scale ±0.6% |

## Surface variants

Both variants share **identical timing, easing, structure, and brand colours for icon + wordmark**. Only backdrop, glow, blend, drop-shadow, and tagline tokens change.

### Dark (ink background)

- Body: `#0f1416`
- Stage: `radial-gradient(120% 90% at 50% 35%, #11181a 0%, #0a0e10 70%, #06090a 100%)`
- Backdrop tint: `rgba(63,198,200,0.18)` (teal-hi)
- Soft glow alpha: `0.22 * beat`
- Heart halo alpha: `0.55 * heartGlow`
- Icon drop-shadow base: `rgba(3,158,160,0.45)` + pulse `rgba(63,198,200, 0.35-0.75)`
- Heart overlay blend: `screen`
- Tagline text colour: `rgba(244,239,230,0.78)` (cream)
- Tagline bars colour: `rgba(244,239,230,0.45)` (cream)

### Light (white background)

- Body: `#ffffff`
- Stage: `radial-gradient(120% 90% at 50% 35%, #ffffff 0%, #f7fafa 70%, #eef5f5 100%)`
- Backdrop tint: `rgba(3,158,160,0.10)` (teal)
- Soft glow alpha: `0.14 * beat`
- Heart halo alpha: `0.30 * heartGlow`
- Icon drop-shadow base: `rgba(3,158,160,0.18)` + pulse `rgba(3,158,160, 0.18-0.43)`
- Heart overlay blend: `multiply`
- Tagline text colour: `rgba(15,20,22,0.65)` (ink)
- Tagline bars colour: `rgba(15,20,22,0.25)` (ink)

### Transparent (no surface)

For compositing over arbitrary backgrounds (photography, video, coloured panels). The backdrop, soft glow, and heart halo are **omitted from the tree entirely** — not just zeroed — so the composition reads cleanly against any underlying surface.

- Body / Stage: `transparent`
- Backdrop tint: **omitted** (node not rendered)
- Soft glow: **omitted** (node not rendered)
- Heart halo: **omitted** (node not rendered)
- Icon drop-shadow: single layer `rgba(3,158,160, 0.25 base / 0.60 peak)`
- Heart overlay blend: **plain alpha** (no `screen` / `multiply`) at `0.18 * (heartGlow - 0.4)`
- Tagline text colour: `BRAND.teal` (`#039EA0`)
- Tagline bars colour: `rgba(3,158,160,0.55)` (teal)

Use this variant when the underlying surface already provides contrast and atmosphere; do **not** stack it over a busy backdrop without ensuring sufficient contrast for the wordmark and tagline.

## Implementation guidance

When implementing in the app:

1. Build a single React component `<SpecialCarerLogoAnimation theme="dark" | "light" | "transparent" durationMs={6000} loop={false} reducedMotionFallback />` under `src/components/motion/`.
2. Switch only the surface tokens listed above on theme change. Timing / easing / structure must not vary by theme. For `theme="transparent"`, **omit** the backdrop, soft glow, and heart halo nodes (do not render with `opacity: 0`).
3. Honour `prefers-reduced-motion` — render the static icon + wordmark + tagline composition with no transitions.
4. For sub-3s use cases (splash, loading), ship a "compact" timing profile that compresses phases A–E into 1.8s and skips the breathing phases.
5. The wordmark must always read **"SpecialCarer"** as one word — never split with spaces or styled to imply two words.
6. The tagline reads **"CARE, 4 U"** uppercase with the comma — do not localise (it is the brand mark).
7. Use `assets/specialcarer-icon.svg` directly; do not re-trace or re-export.

## Recommended integration points

- **iOS / mobile-web splash** — compact 1.8s loop while bootstrap fetches.
- **Web homepage hero** — full 6s once on first load, settle into static composition.
- **Auth redirect / app boot** — compact loop while Supabase session resolves.
- **Onboarding step 1** — full 6s as the introduction.
- **Email banners** — static export of the final frame (no animation in email).
