/**
 * GET /api/dsar/[id]/download
 *
 * Re-download a delivered DSAR export. The `dsar-fulfil` cron writes
 * a 24-hour signed URL into the delivery email but doesn't persist it
 * (signed URLs shouldn't be stored). When the user lands on
 * /settings/data days later this route mints a fresh 15-minute signed
 * URL against `dsar_requests.delivery_object_path` and 302s the
 * browser to it.
 *
 * Ownership: enforced twice. First we call `supabase.auth.getUser()`
 * on the caller's session (so anon = 401). Then we read the row via
 * the admin client and reject unless `row.subject_user_id ===
 * auth.uid()`. The row is only reachable at all if the caller was
 * already able to see it via the `dsar_requests_subject_read` RLS
 * policy on /settings/data — this route is defence in depth so a
 * pasted URL from another user's session doesn't hand out data.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "dsar-exports";
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const UNDEFINED_TABLE = "42P01";

function jsonError(code: string, status: number) {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) return jsonError("bad_request", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("unauthenticated", 401);

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("dsar_requests")
    .select("id, subject_user_id, state, delivery_object_path")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (
      error.code === UNDEFINED_TABLE ||
      /relation .* does not exist/i.test(error.message ?? "")
    ) {
      return jsonError("schema_not_ready", 503);
    }
    return jsonError("lookup_failed", 500);
  }
  if (!row) return jsonError("not_found", 404);
  if (row.subject_user_id !== user.id) return jsonError("forbidden", 403);
  if (row.state !== "delivered" || !row.delivery_object_path) {
    return jsonError("not_ready", 409);
  }

  const { data: signed, error: signError } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(row.delivery_object_path, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return jsonError("sign_failed", 500);
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
