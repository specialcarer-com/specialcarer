import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAdminMfaGate, needsMfaChallenge } from "@/lib/security/mfa-gate";
import {
  getAalLevels,
  hasVerifiedTotpFactor,
} from "@/lib/security/mfa-server";

/**
 * Auth callback handler. Two payload shapes arrive here:
 *   1. Magic-link / email OTP token exchange (?token_hash=&type=)
 *   2. OAuth code exchange (?code=)
 *
 * Mobile vs desktop routing
 * -------------------------
 * Supabase's confirmation email button always lands on the configured
 * Site URL (https://specialcarers.com/auth/callback). When a user signed
 * up through the mobile app they expect to be returned to the mobile
 * surface, not the web dashboard. We detect this in two ways:
 *
 *   a. An explicit hint via ?flow=mobile or ?next=/m/...
 *   b. A mobile User-Agent (iOS / Android) on the request
 *
 * Either trigger routes the user back into /m/* after the session is
 * established. This keeps the existing web flow working unchanged.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const flow = url.searchParams.get("flow");
  const explicitNext = url.searchParams.get("next");

  const userAgent = req.headers.get("user-agent") || "";
  const looksMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);
  const wantsMobile =
    flow === "mobile" ||
    (explicitNext?.startsWith("/m/") ?? false) ||
    looksMobile;

  const fallbackNext = wantsMobile ? "/m/home" : "/dashboard";
  const next = explicitNext || fallbackNext;

  // Password-recovery flows must always land on the set-new-password screen,
  // never the dashboard. verifyOtp() with type="recovery" creates a real
  // session (this is how Supabase Auth works), so without this short-circuit
  // the recovery link would silently sign the user in without forcing them
  // to set a new password.
  const isRecovery = type === "recovery";
  const resetPasswordPath = wantsMobile ? "/m/reset-password" : "/auth/reset-password";

  const supabase = await createClient();

  try {
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (token_hash && type) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.auth.verifyOtp({ type: type as any, token_hash });
      if (error) throw error;
    } else {
      throw new Error("No auth payload");
    }
  } catch {
    const errorTarget = wantsMobile ? "/m/login?error=callback" : "/login?error=callback";
    return NextResponse.redirect(new URL(errorTarget, req.url));
  }

  if (isRecovery) {
    return NextResponse.redirect(new URL(resetPasswordPath, req.url));
  }

  // Decide where to send the user. If profile is incomplete, push to onboarding.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, country, role")
      .eq("id", user.id)
      .maybeSingle();

    // Admins land in the admin dashboard, not the seeker surface. Honor an
    // explicit ?next that already points into /admin/* (e.g. a deep link the
    // admin clicked); otherwise default admins to /admin/countries. If no
    // profile row exists yet, fall through to the normal redirect below.
    if (profile?.role === "admin") {
      const adminTarget = explicitNext?.startsWith("/admin/")
        ? explicitNext
        : "/admin/countries";
      const [aal, hasTotp] = await Promise.all([
        getAalLevels(supabase),
        hasVerifiedTotpFactor(supabase),
      ]);
      const gate = resolveAdminMfaGate({
        isAdmin: true,
        hasVerifiedTotp: hasTotp,
        aal,
      });
      if (gate.status === "setup_required") {
        return NextResponse.redirect(
          new URL(
            `/admin/mfa/setup?next=${encodeURIComponent(adminTarget)}`,
            req.url,
          ),
        );
      }
      if (gate.status === "challenge_required") {
        return NextResponse.redirect(
          new URL(
            `/admin/mfa/challenge?next=${encodeURIComponent(adminTarget)}`,
            req.url,
          ),
        );
      }
      return NextResponse.redirect(new URL(adminTarget, req.url));
    }

    const aal = await getAalLevels(supabase);
    if (needsMfaChallenge(aal)) {
      return NextResponse.redirect(
        new URL(`/sign-in/2fa?next=${encodeURIComponent(next)}`, req.url),
      );
    }

    if (!profile?.full_name || !profile?.country) {
      const onboardingPath = wantsMobile ? "/m/onboarding" : "/onboarding";
      return NextResponse.redirect(
        new URL(`${onboardingPath}?next=${encodeURIComponent(next)}`, req.url)
      );
    }
  }

  return NextResponse.redirect(new URL(next, req.url));
}
