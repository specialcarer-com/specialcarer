import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type EnrolResponse = {
  factorId: string;
  /** Data-URL SVG QR code to scan, plus the manual entry secret + URI. */
  qrCode: string;
  secret: string;
  uri: string;
};

/**
 * POST /api/m/security/2fa/enrol
 *
 * Begins TOTP enrolment via Supabase MFA. Returns the QR code + manual secret
 * for the authenticator app. The factor stays UNVERIFIED until the user proves
 * possession at /api/m/security/2fa/verify, so this stores nothing of our own.
 *
 * Auth: any signed-in user (enrolling their own factor).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Supabase rejects a second factor with a duplicate friendly name; suffix
  // with a short random tag so re-enrolling after an abandoned attempt works.
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `SpecialCarer ${Date.now().toString(36)}`,
  });
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not start 2FA enrolment." },
      { status: 400 },
    );
  }

  const body: EnrolResponse = {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
  return NextResponse.json(body);
}
