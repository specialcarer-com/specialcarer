import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceKey } from "@/lib/care/services";
import { computeReadiness } from "@/lib/care/profile";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/caregiver/profile
 *
 * Upsert the authenticated caregiver's profile.
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  type Body = {
    display_name?: string;
    headline?: string;
    bio?: string;
    city?: string;
    region?: string | null;
    country?: "GB" | "US";
    services?: string[];
    hourly_rate_cents?: number;
    currency?: "GBP" | "USD";
    years_experience?: number;
    languages?: string[];
    max_radius_km?: number;
    photo_url?: string | null;
  };
  const body = (await req.json()) as Body;

  const update: Record<string, unknown> = {};

  if (body.display_name !== undefined) {
    if (typeof body.display_name !== "string" || body.display_name.length > 80) {
      return NextResponse.json({ error: "Invalid display_name" }, { status: 400 });
    }
    update.display_name = body.display_name.trim();
  }
  if (body.headline !== undefined) {
    if (typeof body.headline !== "string" || body.headline.length > 120) {
      return NextResponse.json({ error: "Invalid headline" }, { status: 400 });
    }
    update.headline = body.headline.trim();
  }
  if (body.bio !== undefined) {
    if (typeof body.bio !== "string" || body.bio.length > 2000) {
      return NextResponse.json({ error: "Invalid bio" }, { status: 400 });
    }
    update.bio = body.bio.trim();
  }
  if (body.city !== undefined) update.city = (body.city || "").trim() || null;
  if (body.region !== undefined) update.region = (body.region || null);
  if (body.country !== undefined) {
    if (body.country !== "GB" && body.country !== "US") {
      return NextResponse.json({ error: "Invalid country" }, { status: 400 });
    }
    update.country = body.country;
  }
  if (body.services !== undefined) {
    if (!Array.isArray(body.services) || !body.services.every((s) => isServiceKey(s))) {
      return NextResponse.json({ error: "Invalid services" }, { status: 400 });
    }
    update.services = body.services;
  }
  if (body.hourly_rate_cents !== undefined) {
    const r = Number(body.hourly_rate_cents);
    if (!Number.isFinite(r) || r < 800 || r > 20000) {
      return NextResponse.json({ error: "Rate must be 8.00–200.00" }, { status: 400 });
    }
    update.hourly_rate_cents = Math.round(r);
  }
  if (body.currency !== undefined) {
    if (body.currency !== "GBP" && body.currency !== "USD") {
      return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
    }
    update.currency = body.currency;
  }
  if (body.years_experience !== undefined) {
    const y = Number(body.years_experience);
    if (!Number.isFinite(y) || y < 0 || y > 60) {
      return NextResponse.json({ error: "Invalid experience" }, { status: 400 });
    }
    update.years_experience = Math.round(y);
  }
  if (body.languages !== undefined) {
    if (
      !Array.isArray(body.languages) ||
      body.languages.some((l) => typeof l !== "string" || l.length > 30)
    ) {
      return NextResponse.json({ error: "Invalid languages" }, { status: 400 });
    }
    update.languages = body.languages.slice(0, 8);
  }
  if (body.max_radius_km !== undefined) {
    const km = Number(body.max_radius_km);
    if (!Number.isFinite(km) || km < 1 || km > 200) {
      return NextResponse.json({ error: "Invalid radius" }, { status: 400 });
    }
    update.max_radius_km = Math.round(km);
  }
  if (body.photo_url !== undefined) update.photo_url = body.photo_url;

  update.updated_at = new Date().toISOString();

  const admin = createAdminClient();

  // Verify caregiver role
  const { data: prof } = await admin
    .from("profiles")
    .select("role, country")
    .eq("id", user.id)
    .maybeSingle();
  if (prof?.role !== "caregiver") {
    return NextResponse.json(
      { error: "Only caregivers can edit a caregiver profile" },
      { status: 403 },
    );
  }

  // Default currency from country if not set
  if (update.country !== undefined && update.currency === undefined) {
    const { data: existing } = await admin
      .from("caregiver_profiles")
      .select("currency")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!existing?.currency) {
      update.currency = update.country === "US" ? "USD" : "GBP";
    }
  }

  const { error } = await admin
    .from("caregiver_profiles")
    .upsert({ user_id: user.id, ...update }, { onConflict: "user_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const readiness = await computeReadiness(user.id);
  return NextResponse.json({ ok: true, readiness });
}

/**
 * POST /api/caregiver/profile { action: "publish" | "unpublish" }
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { action } = (await req.json()) as { action?: string };
  if (action !== "publish" && action !== "unpublish") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (action === "publish") {
    const readiness = await computeReadiness(user.id);
    if (!readiness.isPublishable) {
      return NextResponse.json(
        { error: "Profile is not publish-ready", readiness },
        { status: 400 },
      );
    }
    await admin
      .from("caregiver_profiles")
      .update({ is_published: true, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true, is_published: true });
  }

  await admin
    .from("caregiver_profiles")
    .update({ is_published: false, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  return NextResponse.json({ ok: true, is_published: false });
}
