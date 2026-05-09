import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SnapshotRow = {
  taken_at: string;
  city_slug: string;
  vertical: string;
  demand_score: number;
  supply_score: number;
  fill_rate: number;
  hour_of_day: number;
};

/**
 * GET /api/admin/ops/heatmap?window=24h
 * Returns the last `window` of snapshots, plus a city × vertical
 * aggregate (latest snapshot per pair) for the heatmap UI.
 *
 * Supported windows: 24h (default), 7d.
 */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const window = url.searchParams.get("window") === "7d" ? "7d" : "24h";
  const since = new Date();
  if (window === "7d") since.setDate(since.getDate() - 7);
  else since.setHours(since.getHours() - 24);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("marketplace_demand_snapshots")
    .select(
      "taken_at, city_slug, vertical, demand_score, supply_score, fill_rate, hour_of_day",
    )
    .gte("taken_at", since.toISOString())
    .order("taken_at", { ascending: false })
    .limit(2000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as SnapshotRow[];

  // Latest per (city, vertical)
  const latest = new Map<string, SnapshotRow>();
  for (const r of rows) {
    const k = `${r.city_slug}|${r.vertical}`;
    if (!latest.has(k)) latest.set(k, r);
  }
  return NextResponse.json({
    window,
    snapshots: rows,
    grid: Array.from(latest.values()),
  });
}
