#!/usr/bin/env node
// Phase 1+2+3 API-level smoke test.
// Mints sessions for test users, hits real API routes, prints pass/fail per check.

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envCandidates = [
  "/home/user/workspace/specialcarer-720b5b4b/.env.local",
  "/home/user/workspace/specialcarer/.env.local",
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
    break;
  }
}

const BASE = "https://specialcarer.com";
const URL_SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROJECT_REF = URL_SUPA.match(/https:\/\/(\w+)\.supabase/)[1];
const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

const PRIYA_ID = "7a6dc3e0-8bac-4874-bf48-250575a685e5";

const admin = createClient(URL_SUPA, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

async function mintCookie(email) {
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) throw new Error(`generateLink ${email}: ${linkErr.message}`);
  const anon = createClient(URL_SUPA, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sessionData, error: sessionErr } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (sessionErr) throw new Error(`verifyOtp ${email}: ${sessionErr.message}`);
  const session = sessionData.session;
  const user = sessionData.user;
  const cookieValue = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: "bearer",
    user,
  });
  const b64 = "base64-" + Buffer.from(cookieValue).toString("base64");
  return { user_id: user.id, cookie: `${COOKIE_NAME}=${b64}` };
}

async function call(method, path, cookie, body, opts2 = {}) {
  const headers = { Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  const opts = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  // Manual redirect mode lets us assert routes return JSON 401/403 instead of
  // 307-ing into /login (the symptom of the redirect()-based admin guard).
  if (opts2.manualRedirect) opts.redirect = "manual";
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  ${PASS} ${name}${detail ? "  · " + detail : ""}`); }
  else { fail++; console.log(`  ${FAIL} ${name}${detail ? "  · " + detail : ""}`); }
}

async function main() {
  console.log("\n=== SpecialCarer API smoke test ===\n");

  // Reset Priya's agency_opt_in_status to ready_for_review so the queue check
  // and the approval step both have a clean starting point. Idempotent.
  console.log("[reset] Priya agency_opt_in_status → ready_for_review");
  {
    const { error } = await admin
      .from("profiles")
      .update({ agency_opt_in_status: "ready_for_review" })
      .eq("id", PRIYA_ID);
    if (error) {
      console.error(`  reset failed: ${error.message}`);
      process.exit(2);
    }
  }

  console.log("[setup] Minting sessions…");
  const family = await mintCookie("test.family@specialcarer.com");
  const carerUk = await mintCookie("test.carer.uk@specialcarer.com");
  const admin_user = await mintCookie("test.admin@specialcarer.com");
  const org = await mintCookie("test.org@specialcarer.com");
  console.log(`  family=${family.user_id}\n  carer=${carerUk.user_id}\n  admin=${admin_user.user_id}\n  org=${org.user_id}\n`);

  // ─── Phase 1: Auth + role basics ───────────────────────────────────────
  console.log("[Phase 1] Auth + roles");
  {
    const r = await call("GET", "/api/me/role", family.cookie);
    check("family /api/me/role → 200 + role=seeker", r.status === 200 && r.body?.role === "seeker", `status=${r.status} role=${r.body?.role}`);
  }
  {
    const r = await call("GET", "/api/me/role", carerUk.cookie);
    check("carer /api/me/role → 200 + role=caregiver", r.status === 200 && r.body?.role === "caregiver", `status=${r.status} role=${r.body?.role}`);
  }
  {
    const r = await call("GET", "/api/me/role", admin_user.cookie);
    check("admin /api/me/role → 200", r.status === 200, `status=${r.status} role=${r.body?.role}`);
  }
  {
    const r = await call("GET", "/api/me/role");
    check("unauthenticated /api/me/role → 401", r.status === 401, `status=${r.status}`);
  }

  // ─── Phase 2: agency opt-in flow ────────────────────────────────────────
  console.log("\n[Phase 2] Agency opt-in");
  {
    const r = await call("GET", "/api/agency-optin/status", carerUk.cookie);
    check("carer GET /api/agency-optin/status → 200", r.status === 200, `status=${r.status}`);
    if (r.status === 200) {
      const g = r.body?.gates ?? r.body;
      check("Priya all 4 gates green",
        g?.contract_ok && g?.dbs_ok && g?.rtw_ok && g?.training_ok,
        `contract=${g?.contract_ok} dbs=${g?.dbs_ok} rtw=${g?.rtw_ok} training=${g?.training_ok}`);
      check("Priya overall_ready=true", g?.overall_ready === true, `overall=${g?.overall_ready}`);
    }
  }
  {
    const r = await call("GET", "/api/agency-optin/status", family.cookie);
    check("seeker GET /api/agency-optin/status → 403", r.status === 403, `status=${r.status}`);
  }
  // Admin queue — BEFORE approve, Priya should be in the ready_for_review queue.
  {
    const r = await call("GET", "/api/admin/agency-optin/queue", admin_user.cookie);
    check("admin GET /api/admin/agency-optin/queue → 200", r.status === 200, `status=${r.status}`);
    if (r.status === 200) {
      const items = Array.isArray(r.body) ? r.body : (r.body?.rows ?? r.body?.items ?? r.body?.carers ?? r.body?.data ?? []);
      const priya = items.find?.(x => x.user_id === carerUk.user_id || x.id === carerUk.user_id || x.carer_id === carerUk.user_id);
      check("Priya appears in ready_for_review queue (pre-approval)", !!priya, `queue size=${items.length ?? "?"}`);
    }
  }
  {
    const r = await call("GET", "/api/admin/agency-optin/queue", family.cookie);
    check("seeker GET admin queue → 401/403", r.status === 401 || r.status === 403, `status=${r.status}`);
  }
  // Approve Priya
  {
    const r = await call("POST", `/api/admin/agency-optin/${carerUk.user_id}/approve`, admin_user.cookie, {});
    check("admin POST approve Priya → 2xx", r.status >= 200 && r.status < 300, `status=${r.status} body=${JSON.stringify(r.body).slice(0,200)}`);
  }
  // After approve, Priya should be 'active' in DB AND no longer in the ready_for_review queue.
  {
    const { data, error } = await admin.from("profiles").select("agency_opt_in_status").eq("id", carerUk.user_id).single();
    check("Priya agency_opt_in_status='active' in DB", !error && data?.agency_opt_in_status === "active", `status=${data?.agency_opt_in_status} err=${error?.message}`);
  }
  {
    const r = await call("GET", "/api/admin/agency-optin/queue", admin_user.cookie);
    if (r.status === 200) {
      const items = Array.isArray(r.body) ? r.body : (r.body?.rows ?? r.body?.items ?? r.body?.carers ?? r.body?.data ?? []);
      const priya = items.find?.(x => x.user_id === carerUk.user_id || x.id === carerUk.user_id || x.carer_id === carerUk.user_id);
      check("Priya NOT in ready_for_review queue (post-approval)", !priya, `queue size=${items.length ?? "?"}`);
    } else {
      check("Priya NOT in ready_for_review queue (post-approval)", false, `status=${r.status}`);
    }
  }

  // ─── Phase 3: payroll ──────────────────────────────────────────────────
  console.log("\n[Phase 3] Payroll");
  {
    const r = await call("GET", "/api/admin/payroll/runs", admin_user.cookie);
    check("admin GET /api/admin/payroll/runs → 200", r.status === 200, `status=${r.status}`);
    if (r.status === 200) {
      const items = Array.isArray(r.body) ? r.body : (r.body?.runs ?? r.body?.items ?? r.body?.data ?? []);
      const apr = items.find?.(x => x.period_start === "2026-04-01" || (x.period_start && x.period_start.startsWith("2026-04")));
      check("April 2026 test run appears in runs list", !!apr, `runs=${items.length ?? "?"}`);
    }
  }
  {
    const r = await call("GET", "/api/carer/payslips", carerUk.cookie);
    check("carer GET /api/carer/payslips → 200", r.status === 200, `status=${r.status}`);
  }
  {
    const r = await call("GET", "/api/carer/payslips", family.cookie);
    check("seeker GET /api/carer/payslips → 401/403", r.status === 401 || r.status === 403, `status=${r.status}`);
  }
  {
    const r = await call("GET", "/api/admin/payroll/disputes", admin_user.cookie);
    check("admin GET /api/admin/payroll/disputes → 200", r.status === 200, `status=${r.status}`);
  }

  // ─── Phase 1 holdover: timesheet routes exist & gate auth ──────────────
  console.log("\n[Phase 1] Timesheet routes (auth-gate check only)");
  {
    // Vercel cron jobs are conventionally GET.
    const r = await call("GET", "/api/cron/auto-approve-timesheets", admin_user.cookie);
    check("cron auto-approve-timesheets reachable (200/202/204/401/403)", [200, 202, 204, 401, 403].includes(r.status), `status=${r.status}`);
  }

  // ─── Admin role-guard sweep ─────────────────────────────────────────────
  // Every admin GET endpoint should return JSON 401/403 for non-admin callers,
  // never a 307 (which is what the broken redirect()-based helper produced).
  // We use redirect:"manual" so that a 307→/login isn't silently followed and
  // mistaken for a 200 from the admin route.
  console.log("\n[Admin guards] Non-admin must get 401/403, never 3xx, on admin GETs");
  const ADMIN_GET_ROUTES = [
    "/api/admin/payroll/runs",
    "/api/admin/payroll/disputes",
    "/api/admin/safety/reports",
    "/api/admin/safety/leave-requests",
    "/api/admin/timeoff",
    "/api/admin/finance/payouts",
    "/api/admin/finance/fraud",
    "/api/admin/finance/tax-docs",
    "/api/admin/community/reports",
    "/api/admin/compliance/dashboard",
    "/api/admin/compliance/documents",
    "/api/admin/cms/posts",
    "/api/admin/cms/faqs",
    "/api/admin/cms/banners",
    "/api/admin/cms/page-hero-banners",
    "/api/admin/support/tickets",
    "/api/admin/memberships",
    "/api/admin/ops/heatmap",
    "/api/admin/ops/surge-rules",
    "/api/admin/analytics/kpis",
    "/api/admin/vetting/interviews",
  ];
  const opt = { manualRedirect: true };
  for (const path of ADMIN_GET_ROUTES) {
    const rSeeker = await call("GET", path, family.cookie, undefined, opt);
    check(
      `seeker GET ${path} → 401/403 (JSON, not 3xx redirect)`,
      rSeeker.status === 401 || rSeeker.status === 403,
      `status=${rSeeker.status}`,
    );
    const rCarer = await call("GET", path, carerUk.cookie, undefined, opt);
    check(
      `carer GET ${path} → 401/403 (JSON, not 3xx redirect)`,
      rCarer.status === 401 || rCarer.status === 403,
      `status=${rCarer.status}`,
    );
    const rAnon = await call("GET", path, undefined, undefined, opt);
    check(
      `anon GET ${path} → 401/403 (JSON, not 3xx redirect)`,
      rAnon.status === 401 || rAnon.status === 403,
      `status=${rAnon.status}`,
    );
  }

  // ─── Summary ───────────────────────────────────────────────────────────
  console.log(`\n=== Result: ${PASS} ${pass} passed   ${fail > 0 ? FAIL : "·"} ${fail} failed ===`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error("FATAL:", e); process.exit(2); });
