import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export type InstantSettings = {
  enabled: boolean;
  min_notice_minutes: number;
  instant_radius_km: number | null;
  auto_decline_minutes: number;
};

const DEFAULTS: InstantSettings = {
  enabled: false,
  min_notice_minutes: 60,
  instant_radius_km: null,
  auto_decline_minutes: 5,
};

/** GET /api/caregiver/instant-settings — returns the caller's settings (or defaults). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("caregiver_instant_settings")
    .select("enabled, min_notice_minutes, instant_radius_km, auto_decline_minutes")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    settings: (data as InstantSettings | null) ?? DEFAULTS,
  });
}

/** PATCH /api/caregiver/instant-settings — upsert. Caregiver role only. */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profileRow } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileRow?.role !== "caregiver") {
    return NextResponse.json(
      { error: "Only caregivers can manage instant booking" },
      { status: 403 },
    );
  }

  type Body = Partial<InstantSettings>;
  const body = (await req.json()) as Body;

  const update: Record<string, unknown> = { user_id: user.id };

  if (body.enabled !== undefined) update.enabled = !!body.enabled;

  if (body.min_notice_minutes !== undefined) {
    const m = Number(body.min_notice_minutes);
    if (!Number.isFinite(m) || m < 15 || m > 1440) {
      return NextResponse.json(
        { error: "min_notice_minutes must be 15–1440" },
        { status: 400 },
      );
    }
    update.min_notice_minutes = Math.round(m);
  }

  if (body.instant_radius_km !== undefined) {
    if (body.instant_radius_km === null) {
      update.instant_radius_km = null;
    } else {
      const r = Number(body.instant_radius_km);
      if (!Number.isFinite(r) || r < 1 || r > 100) {
        return NextResponse.json(
          { error: "instant_radius_km must be 1–100" },
          { status: 400 },
        );
      }
      update.instant_radius_km = Math.round(r);
    }
  }

  if (body.auto_decline_minutes !== undefined) {
    const a = Number(body.auto_decline_minutes);
    if (!Number.isFinite(a) || a < 1 || a > 60) {
      return NextResponse.json(
        { error: "auto_decline_minutes must be 1–60" },
        { status: 400 },
      );
    }
    update.auto_decline_minutes = Math.round(a);
  }

  const { error } = await admin
    .from("caregiver_instant_settings")
    .upsert(update, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = await admin
    .from("caregiver_instant_settings")
    .select("enabled, min_notice_minutes, instant_radius_km, auto_decline_minutes")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    settings: (data as InstantSettings | null) ?? DEFAULTS,
  });
}
