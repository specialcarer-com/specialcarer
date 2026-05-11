// scripts/seed-test-payroll-run.mjs
//
// Seeds a single test payroll_runs row for smoke-testing the Phase 3
// preview/dispute flow. Idempotent — re-running is safe (upserts on the
// natural key period_start+period_end).
//
// Period: 2026-04-01 → 2026-04-30
// Scheduled run date: 2026-05-15
// Preview opens at: 2026-05-12 09:00 UTC (T-72h)
// Status: scheduled
//
// Run with: node scripts/seed-test-payroll-run.mjs
// Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in env (or .env.local).

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env.local");
if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const row = {
  period_start: "2026-04-01",
  period_end: "2026-04-30",
  scheduled_run_date: "2026-05-15",
  preview_opens_at: "2026-05-12T09:00:00Z",
  preview_closes_at: "2026-05-15T00:00:00Z",
  status: "scheduled",
};

const { data, error } = await supabase
  .from("payroll_runs")
  .upsert(row, { onConflict: "period_start,period_end" })
  .select("id, period_start, period_end, scheduled_run_date, status")
  .single();

if (error) {
  console.error("seed failed:", error.message);
  process.exit(1);
}
console.log("seeded payroll_run:", data);
