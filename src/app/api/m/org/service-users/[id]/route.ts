import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership } from "@/lib/org/server";
import type { ServiceUserFormValues } from "@/lib/org/booking-types";
import { CARE_CATEGORIES } from "@/lib/org/booking-types";

/** GET  /api/m/org/service-users/[id] */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await admin
    .from("service_users")
    .select("*")
    .eq("id", id)
    .eq("organization_id", member.organization_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ service_user: data });
}

/** PATCH /api/m/org/service-users/[id] — update fields */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (member.role === "viewer") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as Partial<ServiceUserFormValues>;

  const categories = body.care_categories
    ? body.care_categories.filter((c) =>
        (CARE_CATEGORIES as readonly string[]).includes(c)
      )
    : undefined;

  const update: Record<string, unknown> = {};
  if (body.full_name !== undefined) update.full_name = body.full_name.trim();
  if (body.dob !== undefined) update.dob = body.dob || null;
  if (body.gender !== undefined) update.gender = body.gender || null;
  if (body.address_line1 !== undefined) update.address_line1 = body.address_line1 || null;
  if (body.address_line2 !== undefined) update.address_line2 = body.address_line2 || null;
  if (body.city !== undefined) update.city = body.city || null;
  if (body.postcode !== undefined) update.postcode = body.postcode || null;
  if (categories !== undefined) update.care_categories = categories;
  if (body.care_needs !== undefined) update.care_needs = body.care_needs || null;
  if (body.safety_notes !== undefined) update.safety_notes = body.safety_notes || null;
  if (body.primary_contact_name !== undefined) update.primary_contact_name = body.primary_contact_name || null;
  if (body.primary_contact_phone !== undefined) update.primary_contact_phone = body.primary_contact_phone || null;

  const { data, error } = await admin
    .from("service_users")
    .update(update)
    .eq("id", id)
    .eq("organization_id", member.organization_id)
    .is("archived_at", null)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found or already archived" }, { status: 404 });

  return NextResponse.json({ service_user: data });
}

/** DELETE /api/m/org/service-users/[id] — soft delete (set archived_at) */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!["owner", "admin"].includes(member.role)) {
    return NextResponse.json({ error: "Only owner/admin can archive service users" }, { status: 403 });
  }

  const { error } = await admin
    .from("service_users")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", member.organization_id)
    .is("archived_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
