/**
 * POST /api/m/dbs/self-verify
 *
 * Carer self-verify path: validate an existing live Update-Service DBS so the
 * carer doesn't pay for a fresh check. Body:
 *   { certificateNumber: string, kind: "adult"|"child", dateOfBirth: "YYYY-MM-DD" }
 *
 * On a valid certificate the carer's application is created/updated as approved
 * with recovery waived. Gated by NEXT_PUBLIC_DBS_ENABLED (403 when off).
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDbsEnabled } from "@/lib/dbs/flag";
import { selfVerifyExistingDbs } from "@/lib/dbs/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isDbsEnabled()) {
    return NextResponse.json({ error: "DBS feature is disabled" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (payload ?? {}) as Record<string, unknown>;
  const certificateNumber =
    typeof b.certificateNumber === "string" ? b.certificateNumber.trim() : "";
  const kind = b.kind;
  const dateOfBirth =
    typeof b.dateOfBirth === "string" ? b.dateOfBirth.trim() : "";

  if (!/^\d{12}$/.test(certificateNumber)) {
    return NextResponse.json(
      { error: "DBS certificate number must be 12 digits." },
      { status: 400 },
    );
  }
  if (kind !== "adult" && kind !== "child") {
    return NextResponse.json(
      { error: "kind must be 'adult' or 'child'." },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return NextResponse.json(
      { error: "Date of birth must be YYYY-MM-DD." },
      { status: 400 },
    );
  }

  try {
    const result = await selfVerifyExistingDbs(user.id, {
      certificateNumber,
      kind,
      dateOfBirth,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 422 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Log the real cause server-side; return a stable, user-safe message.
    // Raw exception text can leak vendor wording or internal paths.
    console.error(
      "[/api/m/dbs/self-verify] verification failed",
      e instanceof Error ? { name: e.name, message: e.message } : e,
    );
    return NextResponse.json(
      {
        error:
          "We couldn't verify your DBS certificate right now. Please try again in a few minutes or contact support.",
      },
      { status: 502 },
    );
  }
}
