import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUkCarer } from "@/lib/agency-optin/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/agency-optin/request-rtw-reverify
 *
 * Triggers a fresh Right-to-Work check. Idempotent: returns {action:'none'}
 * if existing RTW is cleared with next_reverify_at > 60 days out.
 * Otherwise flags the existing row as due and redirects the client to the
 * verification dashboard where the uChecks invite is surfaced.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, country")
    .eq("id", user.id)
    .maybeSingle<{ role: string; country: string | null }>();
  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isUkCarer(profile.country)) {
    return NextResponse.json(
      { error: "Agency opt-in is available in UK only for now" },
      { status: 400 },
    );
  }

  const { data: existing } = await admin
    .from("background_checks")
    .select("id, status, reverify_status, next_reverify_at, issued_at")
    .eq("user_id", user.id)
    .eq("check_type", "right_to_work")
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      status: string;
      reverify_status: string | null;
      next_reverify_at: string | null;
      issued_at: string | null;
    }>();

  const sixtyDaysFromNow = Date.now() + 60 * 24 * 60 * 60 * 1000;
  const isFresh =
    !!existing &&
    existing.status === "cleared" &&
    (existing.reverify_status === null ||
      existing.reverify_status === "cleared") &&
    (existing.next_reverify_at === null ||
      new Date(existing.next_reverify_at).getTime() > sixtyDaysFromNow);

  if (isFresh) {
    return NextResponse.json({ ok: true, action: "none" });
  }

  if (existing) {
    await admin
      .from("background_checks")
      .update({ reverify_status: "due" })
      .eq("id", existing.id);
  }

  return NextResponse.json({
    ok: true,
    action: "redirect",
    redirect_to: "/dashboard/verification",
  });
}
