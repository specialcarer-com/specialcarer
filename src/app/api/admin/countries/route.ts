import { NextResponse } from "next/server";
import { requireAdminApi, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("countries")
    .select(
      "code, name, flag_emoji, enabled_for_signup, enabled_for_search, currency_code, default_locale, display_order, notes, updated_at",
    )
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ countries: data ?? [] });
}

export async function POST(req: Request) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  const me = guard.admin;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;

  const code =
    typeof p.code === "string" ? p.code.trim().toUpperCase() : "";
  const name = typeof p.name === "string" ? p.name.trim() : "";
  if (!/^[A-Z]{2}$/.test(code)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }

  const row = {
    code,
    name,
    flag_emoji:
      typeof p.flag_emoji === "string" && p.flag_emoji.trim()
        ? p.flag_emoji.trim()
        : null,
    enabled_for_signup: p.enabled_for_signup === true,
    enabled_for_search: p.enabled_for_search === true,
    currency_code:
      typeof p.currency_code === "string" && p.currency_code.trim()
        ? p.currency_code.trim().toUpperCase()
        : "GBP",
    default_locale:
      typeof p.default_locale === "string" && p.default_locale.trim()
        ? p.default_locale.trim()
        : "en-GB",
    display_order:
      typeof p.display_order === "number" ? p.display_order : 100,
    notes:
      typeof p.notes === "string" && p.notes.trim() ? p.notes.trim() : null,
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("countries")
    .insert(row)
    .select("code")
    .single();
  if (error || !data) {
    const conflict = error?.code === "23505";
    return NextResponse.json(
      { error: conflict ? "country_exists" : error?.message ?? "insert_failed" },
      { status: conflict ? 409 : 500 },
    );
  }

  await logAdminAction({
    admin: me,
    action: "country.create",
    targetType: "country",
    targetId: code,
    details: row,
  });
  return NextResponse.json({ country: data });
}
