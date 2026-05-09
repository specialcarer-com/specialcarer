import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_SAVED = 20;

type CreateBody = {
  name?: string;
  filters?: Record<string, unknown>;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("carer_saved_searches")
    .select("id, name, filters, created_at, updated_at")
    .eq("carer_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ searches: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  const filters =
    body.filters && typeof body.filters === "object" ? body.filters : {};

  const { count } = await supabase
    .from("carer_saved_searches")
    .select("id", { count: "exact", head: true })
    .eq("carer_id", user.id);
  if ((count ?? 0) >= MAX_SAVED) {
    return NextResponse.json(
      { error: `Limit ${MAX_SAVED} saved searches` },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("carer_saved_searches")
    .insert({ carer_id: user.id, name, filters })
    .select("id, name, filters, created_at, updated_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ search: data });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const { error } = await supabase
    .from("carer_saved_searches")
    .delete()
    .eq("id", id)
    .eq("carer_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
