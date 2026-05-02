import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles two cases:
// 1. Magic-link / email OTP exchange (?token_hash=&type=)
// 2. OAuth code exchange (?code=)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") || "/dashboard";

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
    return NextResponse.redirect(new URL("/login?error=callback", req.url));
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
      return NextResponse.redirect(
        new URL(`/onboarding?next=${encodeURIComponent(next)}`, req.url)
      );
    }
  }

  return NextResponse.redirect(new URL(next, req.url));
}
