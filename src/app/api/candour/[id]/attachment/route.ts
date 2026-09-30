/**
 * POST /api/candour/[id]/attachment — upload an attachment for a
 * notifiable-event case (Phase C — PR C3b).
 *
 * Admin-only. Accepts multipart form-data with a single `file` field.
 * Validates size (≤ 10 MB) and MIME type (pdf | jpeg | png | docx | txt).
 * Uploads to Supabase Storage bucket `notifiable-events` under the path
 * `{event_id}/{ISO_timestamp}_{sanitized_filename}`. On success calls
 * `addAttachment` to append an audit-trail row with the storage path.
 *
 * The bucket + RLS policies are defined in
 * `supabase/migrations/20260912180000_notifiable_events_storage.sql`.
 * If the bucket / migration is not yet applied, the storage-upload
 * error surfaces as an ordinary 400 — the addAttachment call would not
 * be reached — matching the deploy-safety story for the schema.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CaseAdminClient } from "@/lib/candour/case";
import { handleAttachment, type AttachmentInput, type StorageUploader } from "./handler";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let input: AttachmentInput | null = null;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const f = file as File;
      input = {
        filename: f.name || "file",
        contentType: f.type || "application/octet-stream",
        size: f.size,
        bytes: await f.arrayBuffer(),
      };
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_form" },
      { status: 400 },
    );
  }
  const admin = createAdminClient();
  return handleAttachment(id, input, {
    getActor: async () => {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      return { id: user.id, role: (profile?.role as string | null) ?? null };
    },
    db: admin as unknown as CaseAdminClient,
    storage: admin.storage.from("notifiable-events") as unknown as StorageUploader,
  });
}
