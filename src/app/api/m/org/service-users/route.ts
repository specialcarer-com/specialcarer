import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership } from "@/lib/org/server";
import type { ServiceUserFormValues } from "@/lib/org/booking-types";
import { CARE_CATEGORIES } from "@/lib/org/booking-types";

/**
 * GET  /api/m/org/service-users  — list active service users for the caller's org
 * POST /api/m/org/service-users  — create a new service user
 */

export const dynamic = "force-dynamic";

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) return null;
  return { user, admin, member };
}

export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await ctx.admin
    .from("service_users")
    .select("*")
    .eq("organization_id", ctx.member.organization_id)
    .is("archived_at", null)
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ service_users: data });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only owner/admin/booker can create service users
  if (ctx.member.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<ServiceUserFormValues>;

  if (!body.full_name?.trim()) {
    return NextResponse.json(
      { error: "full_name is required" },
      { status: 400 }
    );
  }

  // Validate care_categories against the canonical 5 verticals
  const categories = (body.care_categories ?? []).filter((c) =>
    (CARE_CATEGORIES as readonly string[]).includes(c)
  );

  const { data, error } = await ctx.admin
    .from("service_users")
    .insert({
      organization_id: ctx.member.organization_id,
      full_name: body.full_name.trim(),
      dob: body.dob || null,
      gender: body.gender || null,
      address_line1: body.address_line1 || null,
      address_line2: body.address_line2 || null,
      city: body.city || null,
      postcode: body.postcode || null,
      care_categories: categories,
      care_needs: body.care_needs || null,
      safety_notes: body.safety_notes || null,
      primary_contact_name: body.primary_contact_name || null,
      primary_contact_phone: body.primary_contact_phone || null,
      created_by: ctx.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ service_user: data }, { status: 201 });
}
