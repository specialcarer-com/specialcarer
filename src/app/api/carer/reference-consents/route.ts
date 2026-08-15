import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ReferenceConsent } from "@/lib/references/consent";
import { createConsentPostHandler } from "./consent-handler";

export const dynamic = "force-dynamic";

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await session();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("carer_reference_consents")
    .select("*")
    .eq("carer_id", user.id)
    .maybeSingle<ReferenceConsent>();
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ consent: data });
}

export const POST = createConsentPostHandler();

export async function DELETE() {
  const { supabase, user } = await session();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { error } = await supabase
    .from("carer_reference_consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("carer_id", user.id)
    .is("revoked_at", null);
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}
