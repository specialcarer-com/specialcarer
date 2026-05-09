import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SURGE_AUTO_DEMAND_RATIO,
  SURGE_AUTO_FILL_THRESHOLD,
  SURGE_AUTO_MULTIPLIER,
  SURGE_MAX_MULTIPLIER,
} from "@/lib/admin-ops/types";

export const dynamic = "force-dynamic";

type Snap = {
  city_slug: string;
  vertical: string;
  demand_score: number;
  supply_score: number;
  fill_rate: number;
  taken_at: string;
};

/**
 * GET /api/cron/surge-recompute
 *
 * Hourly recompute. For each (city, vertical) latest snapshot:
 * - If a manual surge_rule is active, do not auto-open / auto-close
 *   (manual override always wins).
 * - Otherwise, auto-open a surge_event when fill_rate < threshold AND
 *   demand > ratio × supply (default 1.3×, capped at 1.5×).
 * - Auto-close any open auto-event whose latest snapshot no longer
 *   meets the threshold.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const admin = createAdminClient();

  // Pull last hour of snapshots, then keep latest per (city, vertical).
  const since = new Date();
  since.setHours(since.getHours() - 2);
  const { data: snaps } = await admin
    .from("marketplace_demand_snapshots")
    .select(
      "city_slug, vertical, demand_score, supply_score, fill_rate, taken_at",
    )
    .gte("taken_at", since.toISOString())
    .order("taken_at", { ascending: false })
    .limit(2000);
  const latest = new Map<string, Snap>();
  for (const r of (snaps ?? []) as Snap[]) {
    const k = `${r.city_slug}|${r.vertical}`;
    if (!latest.has(k)) latest.set(k, r);
  }

  // Manual rules take precedence.
  const { data: rules } = await admin
    .from("surge_rules")
    .select("id, city_slug, vertical, multiplier, active");
  const manual = new Set<string>();
  for (const r of (rules ?? []) as {
    city_slug: string;
    vertical: string;
    active: boolean;
  }[]) {
    if (r.active) manual.add(`${r.city_slug}|${r.vertical}`);
  }

  // Active auto-events.
  const { data: openEvents } = await admin
    .from("surge_events")
    .select("id, city_slug, vertical, rule_id")
    .is("ended_at", null);

  const opened: string[] = [];
  const closed: string[] = [];

  // Open new events as needed.
  for (const [k, snap] of latest.entries()) {
    if (manual.has(k)) continue;
    const meetsCondition =
      snap.fill_rate < SURGE_AUTO_FILL_THRESHOLD &&
      snap.demand_score > snap.supply_score * SURGE_AUTO_DEMAND_RATIO;
    const isOpen = (openEvents ?? []).some(
      (e) =>
        e.city_slug === snap.city_slug &&
        e.vertical === snap.vertical &&
        e.rule_id == null,
    );
    if (meetsCondition && !isOpen) {
      const mult = Math.min(SURGE_AUTO_MULTIPLIER, SURGE_MAX_MULTIPLIER);
      const { data: ins } = await admin
        .from("surge_events")
        .insert({
          city_slug: snap.city_slug,
          vertical: snap.vertical,
          multiplier: mult,
          reason: "auto: fill_rate<0.6 & demand>1.5×supply",
        })
        .select("id")
        .single();
      if (ins) opened.push(ins.id as string);
    }
  }

  // Close auto-events that no longer meet the condition.
  for (const ev of (openEvents ?? []) as {
    id: string;
    city_slug: string;
    vertical: string;
    rule_id: string | null;
  }[]) {
    if (ev.rule_id != null) continue; // manual event — do not auto-close
    const snap = latest.get(`${ev.city_slug}|${ev.vertical}`);
    if (!snap) continue;
    const stillSurge =
      snap.fill_rate < SURGE_AUTO_FILL_THRESHOLD &&
      snap.demand_score > snap.supply_score * SURGE_AUTO_DEMAND_RATIO;
    if (!stillSurge) {
      await admin
        .from("surge_events")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", ev.id);
      closed.push(ev.id);
    }
  }

  return NextResponse.json({
    ok: true,
    opened: opened.length,
    closed: closed.length,
    pairs_evaluated: latest.size,
  });
}
