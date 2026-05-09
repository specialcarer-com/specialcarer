"use client";

/**
 * Motion-brand QA + decision tool.
 *
 * Renders each logo variant inside the surface contexts it would actually
 * ship in (white card, dark panel, brand-teal gradient, photo stand-in,
 * mobile splash device frame), so the team can pick where each variant
 * earns its place.
 *
 * Internal route — not linked from any user-facing page.
 *   /design/motion-brand
 */

import { useState } from "react";
import {
  SpecialCarerLogoAnimation,
  SpecialCarerMobileSplash,
  type LogoTheme,
} from "@/components/motion";

interface VariantContext {
  id: string;
  label: string;
  description: string;
  recommendedUse: string[];
  background: string;
  // Logo theme to use for this context
  theme: LogoTheme | "splash" | "splash-slow";
  /** Padding inside the framed card. */
  padding?: number | string;
}

const LOGO_CONTEXTS: VariantContext[] = [
  {
    id: "dark-hero",
    label: "Dark hero / footer",
    description:
      "The dark surface variant on the brand ink panel. The full backdrop tint, soft glow and heart halo render at the spec'd intensities.",
    recommendedUse: [
      "Marketing site footer",
      "Dark-mode app header",
      "Email banners (final-frame static)",
    ],
    background: "#0F1416",
    theme: "dark",
  },
  {
    id: "light-card",
    label: "Light card / white surface",
    description:
      "The light surface variant on white. Backdrop tint and halos are softened to keep the icon legible against the bright background.",
    recommendedUse: [
      "Web homepage hero (white wash)",
      "Onboarding step 1 (light)",
      "PDF / certificate cover sheets",
    ],
    background: "#ffffff",
    theme: "light",
  },
  {
    id: "transparent-brand-panel",
    label: "Transparent · over brand teal",
    description:
      "Transparent variant composited on a brand teal gradient. Backdrop / glow / halo nodes are fully omitted — composition reads cleanly.",
    recommendedUse: [
      "Brand-teal hero bands",
      "Splash overlays on coloured panels",
      "Marketing landing strips",
    ],
    background: "linear-gradient(135deg, #039EA0 0%, #02787A 100%)",
    theme: "transparent",
  },
  {
    id: "transparent-photo",
    label: "Transparent · over photo stand-in",
    description:
      "Transparent variant on a photographic stand-in. Use only when the underlying image has enough contrast — verify wordmark legibility.",
    recommendedUse: [
      "Photo-led campaign hero (with vignette)",
      "Video overlays (with grading)",
    ],
    background:
      "linear-gradient(135deg, rgba(15,20,22,0.55) 0%, rgba(15,20,22,0.10) 100%), radial-gradient(at 30% 30%, #0c2a2d 0%, #06151a 60%, #03090b 100%)",
    theme: "transparent",
  },
];

export default function MotionBrandPreviewPage() {
  const [logoKey, setLogoKey] = useState(0);
  const [splashStandardKey, setSplashStandardKey] = useState(0);
  const [splashSlowKey, setSplashSlowKey] = useState(0);

  return (
    <div
      style={{
        padding: "32px 24px 80px",
        background: "#f7fafa",
        minHeight: "100vh",
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: "#0F1416",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 32, marginBottom: 8, lineHeight: 1.1 }}>
            Motion brand · QA &amp; decision tool
          </h1>
          <p style={{ color: "#475569", maxWidth: 720, margin: 0 }}>
            Compare each variant in the surface context it would actually ship in.
            Use the replay buttons to reset every animation simultaneously, then
            decide where each variant earns its place. Pinned design specs:{" "}
            <code>design/motion-brand/</code>.
          </p>
        </header>

        {/* ─── Logo animation contexts ────────────────────────────── */}
        <section style={{ marginBottom: 56 }}>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <h2 style={{ fontSize: 22, margin: 0 }}>Logo animation · 3 surface variants</h2>
              <p style={{ color: "#64748B", margin: "4px 0 0", fontSize: 14 }}>
                1920×1080 landscape · 6s timeline · identical timing/easing across themes
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLogoKey((k) => k + 1)}
              style={btnPrimary}
            >
              Replay all
            </button>
          </header>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: 20,
            }}
          >
            {LOGO_CONTEXTS.map((ctx) => (
              <article key={ctx.id} style={card}>
                <div
                  style={{
                    background: ctx.background,
                    borderRadius: 12,
                    overflow: "hidden",
                    aspectRatio: "16 / 9",
                  }}
                >
                  <SpecialCarerLogoAnimation
                    key={`${ctx.id}-${logoKey}`}
                    theme={ctx.theme as LogoTheme}
                  />
                </div>
                <div style={{ padding: "16px 4px 4px" }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{ctx.label}</h3>
                  <p
                    style={{
                      color: "#475569",
                      fontSize: 13,
                      margin: "8px 0",
                      lineHeight: 1.5,
                    }}
                  >
                    {ctx.description}
                  </p>
                  <div style={{ marginTop: 10 }}>
                    <div
                      style={{
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        fontSize: 11,
                        color: "#039EA0",
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Recommended use
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                      {ctx.recommendedUse.map((u) => (
                        <li key={u}>{u}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ─── Mobile splash variants ─────────────────────────────── */}
        <section style={{ marginBottom: 56 }}>
          <header style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, margin: 0 }}>Mobile app splash · pacing variants</h2>
            <p style={{ color: "#64748B", margin: "4px 0 0", fontSize: 14 }}>
              1080×1920 portrait · ripple · sparkle · drift · impact flash · progress dots
            </p>
          </header>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 20,
            }}
          >
            <article style={card}>
              <DeviceFrame>
                <SpecialCarerMobileSplash key={`std-${splashStandardKey}`} />
              </DeviceFrame>
              <div style={{ padding: "16px 4px 4px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 16 }}>Standard · 10s @ SLOW=1.7</h3>
                  <button
                    type="button"
                    onClick={() => setSplashStandardKey((k) => k + 1)}
                    style={btnPrimary}
                  >
                    Replay
                  </button>
                </div>
                <p style={{ color: "#475569", fontSize: 13, margin: "8px 0", lineHeight: 1.5 }}>
                  Quicker rhythm. Best for returning-user boot, where the user has seen the
                  reveal before and you want to get out of the way.
                </p>
                <div
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    fontSize: 11,
                    color: "#039EA0",
                    fontWeight: 600,
                    marginTop: 8,
                  }}
                >
                  Recommended use
                </div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13 }}>
                  <li>iOS / mobile-web returning-user boot</li>
                  <li>Auth redirect / Supabase session resolve</li>
                  <li>Background-app-resume cold start</li>
                </ul>
              </div>
            </article>

            <article style={card}>
              <DeviceFrame>
                <SpecialCarerMobileSplash key={`slow-${splashSlowKey}`} slow />
              </DeviceFrame>
              <div style={{ padding: "16px 4px 4px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 16 }}>Slowed · 14s @ SLOW=2.5</h3>
                  <button
                    type="button"
                    onClick={() => setSplashSlowKey((k) => k + 1)}
                    style={btnPrimary}
                  >
                    Replay
                  </button>
                </div>
                <p style={{ color: "#475569", fontSize: 13, margin: "8px 0", lineHeight: 1.5 }}>
                  Cinematic pacing. The reveal carries weight; recommended for first-launch
                  and onboarding where you want the user to feel the brand.
                </p>
                <div
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    fontSize: 11,
                    color: "#039EA0",
                    fontWeight: 600,
                    marginTop: 8,
                  }}
                >
                  Recommended use
                </div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13 }}>
                  <li>First-launch (post-install) splash</li>
                  <li>Onboarding step 1 intro</li>
                  <li>Marketing demo / video assets</li>
                </ul>
              </div>
            </article>
          </div>
        </section>

        {/* ─── Decision matrix ────────────────────────────────────── */}
        <section>
          <h2 style={{ fontSize: 22, margin: "0 0 16px" }}>Decision matrix · where each variant earns its place</h2>
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F4EFE6" }}>
                  <th style={th}>Surface / context</th>
                  <th style={th}>Recommended variant</th>
                  <th style={th}>Why</th>
                </tr>
              </thead>
              <tbody>
                {DECISION_ROWS.map((row) => (
                  <tr key={row.surface} style={{ borderTop: "1px solid #E2E8F0" }}>
                    <td style={td}>
                      <strong>{row.surface}</strong>
                    </td>
                    <td style={td}>
                      <code style={codeStyle}>{row.variant}</code>
                    </td>
                    <td style={{ ...td, color: "#475569" }}>{row.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ marginTop: 16, fontSize: 13, color: "#64748B" }}>
            These are recommendations — replay each preview above and confirm before we wire them
            into hero, splash, onboarding and email banners.
          </p>
        </section>
      </div>
    </div>
  );
}

interface DecisionRow {
  surface: string;
  variant: string;
  why: string;
}

const DECISION_ROWS: DecisionRow[] = [
  {
    surface: "iOS first-launch splash (post-install)",
    variant: "Mobile splash · slowed (14s)",
    why: "First impression — let the brand reveal carry weight. Cross-fade out as soon as Supabase resolves; don't gate boot.",
  },
  {
    surface: "iOS / mobile-web returning-user boot",
    variant: "Mobile splash · standard (10s)",
    why: "User has seen it before. Tighter rhythm gets out of the way.",
  },
  {
    surface: "Web homepage hero",
    variant: "Logo · light",
    why: "Plays once on first visit, settles into static composition. Keeps the page calm.",
  },
  {
    surface: "Marketing site footer",
    variant: "Logo · dark",
    why: "Footer is brand-ink. Soft glow + halo read well against the deep background.",
  },
  {
    surface: "Brand-teal hero bands / coloured panels",
    variant: "Logo · transparent",
    why: "Backdrop / glow / halo are omitted — composition reads cleanly without competing with the panel colour.",
  },
  {
    surface: "Photo / video overlays",
    variant: "Logo · transparent (with vignette grade)",
    why: "Only over imagery with sufficient contrast. Verify wordmark legibility per asset.",
  },
  {
    surface: "Onboarding step 1 (web)",
    variant: "Logo · light",
    why: "Web onboarding is light-themed. Full 6s reveal once.",
  },
  {
    surface: "Onboarding step 1 (mobile)",
    variant: "Mobile splash · slowed",
    why: "Same component as first-launch — keeps the brand reveal cohesive across boot and onboarding.",
  },
  {
    surface: "Auth redirect / loading states",
    variant: "Logo · light (compact 1.8s loop)",
    why: "Compact-mode static fallback. Don't ship the full 6s reveal as a loader.",
  },
  {
    surface: "Email banners",
    variant: "Static final-frame export of dark or light",
    why: "Email clients don't support the animation. Use a PNG of the final composition matching the email theme.",
  },
  {
    surface: "App Store / TestFlight screenshots",
    variant: "Mobile splash · static final frame",
    why: "Use a single rendered frame at t=6s. Preserve composition without animation.",
  },
];

// ─── Components ──────────────────────────────────────────────────

function DeviceFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 280,
        margin: "0 auto",
        borderRadius: 32,
        overflow: "hidden",
        boxShadow:
          "0 20px 60px rgba(3,158,160,0.18), 0 0 0 8px #0F1416, 0 0 0 9px rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ aspectRatio: "9 / 16", width: "100%", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 3px rgba(15,20,22,0.06), 0 4px 18px rgba(15,20,22,0.04)",
  margin: 0,
};

const btnPrimary: React.CSSProperties = {
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  fontSize: 13,
  fontWeight: 600,
  background: "#039EA0",
  color: "#fff",
  padding: "8px 14px",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
};

const th: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "#0F1416",
};

const td: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: 14,
  verticalAlign: "top",
};

const codeStyle: React.CSSProperties = {
  background: "#F4EFE6",
  padding: "2px 8px",
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
};
