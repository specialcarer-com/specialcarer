import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback handler. Two payload shapes arrive here:
 *   1. Magic-link / email OTP token exchange (?token_hash=&type=)
 *   2. OAuth code exchange (?code=)
 *
 * Mobile vs desktop routing
 * -------------------------
 * Supabase's confirmation email button always lands on the configured
 * Site URL (https://specialcarer.com/auth/callback). When a user signed
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

  // Decide where to send the user. If profile is incomplete, push to onboarding.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, country")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.full_name || !profile?.country) {
      const onboardingPath = wantsMobile ? "/m/onboarding" : "/onboarding";
      return NextResponse.redirect(
        new URL(`${onboardingPath}?next=${encodeURIComponent(next)}`, req.url)
      );
    }
  }

  return NextResponse.redirect(new URL(next, req.url));
}
