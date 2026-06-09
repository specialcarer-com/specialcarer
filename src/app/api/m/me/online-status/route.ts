/**
 * GET/POST /api/m/me/online-status
 *
 * GET  → returns the caller's current presence
 *        { status: { is_online, last_online_at, online_radius_km } }.
 *        is_online is reported as false when last_online_at is older than
 *        STALE_AFTER_MS (30 min) — a client-side heartbeat or the toggle
 *        keeps it fresh; we never surface a stale "online" carer.
 *
 * POST → body { online: boolean, radius_km?: number } flips the flag via
 *        the set_carer_online_status RPC and returns the updated status.
 *
 * Auth: any signed-in user; the RPC writes only the caller's row. A
 * non-carer simply has no caregiver_profiles row and gets a 500/no-profile.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  handleOnlineStatus,
  type OnlineStatus,
  type OnlineStatusBody,
  type OnlineStatusClient,
} from "./online-status-handler";

export const dynamic = "force-dynamic";

// A carer is treated as offline once their last_online_at is older than
// this, even if is_online is still true (e.g. they closed the app without
// toggling off). Keep in sync with the auto-match "Now" freshness window.
const STALE_AFTER_MS = 30 * 60 * 1000;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("caregiver_profiles")
    .select("is_online, last_online_at, online_radius_km")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "no_caregiver_profile" }, { status: 404 });
  }

  const lastOnlineAt = (data.last_online_at as string | null) ?? null;
  const fresh =
    lastOnlineAt != null &&
    Date.now() - new Date(lastOnlineAt).getTime() < STALE_AFTER_MS;

  const status: OnlineStatus = {
    is_online: data.is_online === true && fresh,
    last_online_at: lastOnlineAt,
    online_radius_km: Number(data.online_radius_km ?? 5),
  };

  return NextResponse.json({ status });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: OnlineStatusBody;
  try {
    body = (await req.json()) as OnlineStatusBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await handleOnlineStatus({
    client: supabase as unknown as OnlineStatusClient,
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
