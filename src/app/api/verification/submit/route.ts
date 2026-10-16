import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStubMode as isUCheckStubMode } from "@/lib/uchecks/server";
import {
  KINDS,
  KIND_KEYS,
  MAX_FILE_BYTES,
  detectMime,
  fileAllowed,
  storagePath,
  validateSubmission,
  type KindKey,
  type RawInput,
} from "@/lib/verification/kinds";

export const runtime = "nodejs";

const BUCKET = "verification-docs";

/**
 * POST /api/verification/submit (multipart/form-data)
 *
 * Carer submits evidence for one check kind. Everything is written with the
 * service role; client sessions have no write access to the table or bucket.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, country")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "caregiver") {
    return NextResponse.json({ error: "Only carers can submit verification evidence" }, { status: 403 });
  }
  if (profile.country !== "GB") {
    return NextResponse.json({ error: "Manual verification is only available in the UK" }, { status: 400 });
  }

  // The manual route is only for while uCheck is not live; otherwise an
  // approval could clear checks that uCheck should be running.
  if (!isUCheckStubMode()) {
    return NextResponse.json({ error: "Manual verification is not available right now." }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the form" }, { status: 400 });
  }

  const kindRaw = form.get("kind");
  if (typeof kindRaw !== "string" || !KIND_KEYS.includes(kindRaw as KindKey)) {
    return NextResponse.json({ error: "Unknown check type" }, { status: 400 });
  }
  const kind = kindRaw as KindKey;
  const def = KINDS[kind];

  const input: RawInput = {};
  const files: Record<string, { buf: Buffer; mime: string }> = {};
  const fileErrors: string[] = [];
  for (const f of def.fields) {
    const v = form.get(f.key);
    if (f.type === "file") {
      if (v instanceof File && v.size > 0) {
        if (v.size > MAX_FILE_BYTES) {
          fileErrors.push(`${f.label} is too large (4MB maximum)`);
        } else {
          // Trust the bytes, not the client-supplied type.
          const buf = Buffer.from(await v.arrayBuffer());
          const mime = detectMime(buf);
          if (!mime || !fileAllowed(f.accept ?? "image", mime)) {
            fileErrors.push(`${f.label} must be a ${f.accept === "image_or_pdf" ? "photo or PDF" : "photo"}`);
          } else {
            files[f.key] = { buf, mime };
          }
        }
      }
    } else if (typeof v === "string") {
      input[f.key] = v;
    }
  }

  const result = validateSubmission(kind, input, Object.keys(files));
  const errors = [...fileErrors, ...(result.ok ? [] : result.errors)];
  if (!result.ok || errors.length) {
    return NextResponse.json({ error: errors.join(". ") }, { status: 400 });
  }

  // One open submission per kind; an approved, unexpired one needs no resubmission.
  const { data: existing, error: existingErr } = await admin
    .from("verification_submissions")
    .select("id, status, expires_at")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .in("status", ["submitted", "approved"]);
  if (existingErr) {
    return NextResponse.json({ error: "We couldn't check your earlier submissions. Please try again." }, { status: 503 });
  }
  if ((existing ?? []).some((r) => r.status === "submitted")) {
    return NextResponse.json({ error: "You already have this waiting for review." }, { status: 409 });
  }
  const now = Date.now();
  if ((existing ?? []).some((r) => r.status === "approved" && (!r.expires_at || new Date(r.expires_at).getTime() > now))) {
    return NextResponse.json({ error: "This has already been approved." }, { status: 409 });
  }

  const { data: row, error: insertErr } = await admin
    .from("verification_submissions")
    .insert({
      user_id: user.id,
      kind,
      data: result.data,
      consent_at: result.consent ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (insertErr || !row) {
    const dup = insertErr?.code === "23505";
    return NextResponse.json(
      { error: dup ? "You already have this waiting for review." : "Could not save your submission. Please try again." },
      { status: dup ? 409 : 500 },
    );
  }

  const paths: Record<string, string> = {};
  for (const [key, file] of Object.entries(files)) {
    const path = storagePath(user.id, row.id, key, file.mime);
    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, file.buf, {
      contentType: file.mime,
      upsert: false,
    });
    if (upErr) {
      // Roll back so the carer can retry cleanly.
      const done = Object.values(paths);
      if (done.length) await admin.storage.from(BUCKET).remove(done);
      await admin.from("verification_submissions").delete().eq("id", row.id).eq("status", "submitted");
      return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
    }
    paths[key] = path;
  }
  if (Object.keys(paths).length) {
    // Only attach files while the submission is still waiting; if it was
    // decided in the meantime, remove what we just uploaded.
    const { data: attached, error: updErr } = await admin
      .from("verification_submissions")
      .update({ files: paths })
      .eq("id", row.id)
      .eq("status", "submitted")
      .select("id");
    if (!updErr && (!attached || attached.length === 0)) {
      await admin.storage.from(BUCKET).remove(Object.values(paths));
      return NextResponse.json({ error: "This submission was already reviewed. Please start again." }, { status: 409 });
    }
    if (updErr) {
      await admin.storage.from(BUCKET).remove(Object.values(paths));
      await admin.from("verification_submissions").delete().eq("id", row.id).eq("status", "submitted");
      return NextResponse.json({ error: "Could not save your submission. Please try again." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: row.id });
}
