import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeReadiness, ensurePublicSlug } from "@/lib/care/profile";
import { publicProfileUrl } from "@/lib/care/public-url";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/profile/share
 *
 * Returns whether the authenticated carer is publish-ready and, if so, the
 * shareable public URL + display name. Drives the "Share my profile" CTA on
 * /m/profile, which is only shown when `ready` is true.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const readiness = await computeReadiness(user.id);
  if (!readiness.isPublishable) {
    return NextResponse.json({ ready: false });
  }

  // Make sure a slug exists so the shared link is the friendly /c/<slug> form.
  const slug = await ensurePublicSlug(user.id);

  const admin = createAdminClient();
  const { data: cg } = await admin
    .from("caregiver_profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const url = publicProfileUrl({ user_id: user.id, public_slug: slug });
  return NextResponse.json({
    ready: true,
    url,
    name: (cg?.display_name as string | null) ?? "Caregiver",
  });
}
