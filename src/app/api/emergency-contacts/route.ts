import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_CONTACTS = 3;

type ContactBody = {
  name?: string;
  phone?: string;
  relationship?: string;
  sort_order?: number;
};

export type EmergencyContact = {
  id: string;
  owner_id: string;
  name: string;
  phone: string;
  relationship: string | null;
  sort_order: number;
  created_at: string;
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
    .from("emergency_contacts")
    .select("id, owner_id, name, phone, relationship, sort_order, created_at")
    .eq("owner_id", user.id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    contacts: (data ?? []) as EmergencyContact[],
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: ContactBody;
  try {
    body = (await req.json()) as ContactBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const relationship =
    typeof body.relationship === "string" && body.relationship.trim()
      ? body.relationship.trim().slice(0, 40)
      : null;
  const sort_order = Number.isFinite(body.sort_order)
    ? Number(body.sort_order)
    : 0;

  if (name.length < 1 || name.length > 80) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  if (phone.length < 5 || phone.length > 30) {
    return NextResponse.json({ error: "Phone required" }, { status: 400 });
  }

  // Enforce 3-per-owner cap. RLS guarantees the count we read is ours.
  const { count } = await supabase
    .from("emergency_contacts")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", user.id);
  if ((count ?? 0) >= MAX_CONTACTS) {
    return NextResponse.json(
      { error: "Limit 3 contacts" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("emergency_contacts")
    .insert({
      owner_id: user.id,
      name,
      phone,
      relationship,
      sort_order,
    })
    .select("id, owner_id, name, phone, relationship, sort_order, created_at")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Insert failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ contact: data as EmergencyContact });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  const { error } = await supabase
    .from("emergency_contacts")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
