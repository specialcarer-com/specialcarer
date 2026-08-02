#!/usr/bin/env node
/**
 * Create Stripe Express test accounts for the seeded test carers and emit
 * fresh hosted-onboarding links. The user clicks each link and completes
 * Stripe's test-mode hosted form (with "Use test data" autofill).
 *
 * Also seeds cleared `background_checks` rows so the booking-intent
 * endpoint passes its second gate.
 *
 * Run:
 *   node scripts/seed-test-carer-onboarding-links.mjs
 *
 * Idempotent: reuses existing acct_xxx if a row already exists in
 * caregiver_stripe_accounts, and refreshes the onboarding link each time.
 */

import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Hand-roll .env.local loader (no dotenv dep).
try {
  const env = readFileSync(".env.local", "utf8");
  for (const raw of env.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
} catch {}

const SECRET = process.env.STRIPE_SECRET_KEY;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://specialcarer.com";

if (!SECRET || !SECRET.startsWith("sk_test_")) {
  console.error("✖ STRIPE_SECRET_KEY missing or not a test-mode key.");
  process.exit(1);
}
if (!SUPA_URL || !SUPA_SVC) {
  console.error("✖ Supabase service role creds missing.");
  process.exit(1);
}

const stripe = new Stripe(SECRET, { apiVersion: "2026-04-22.dahlia" });
const supa = createClient(SUPA_URL, SUPA_SVC, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CARERS = [
  {
    label: "Priya Sharma (UK)",
    user_id: "7a6dc3e0-8bac-4874-bf48-250575a685e5",
    email: "test.carer.uk@specialcarer.com",
    country: "GB",
    currency: "gbp",
    bg_checks: ["enhanced_dbs_barred", "right_to_work", "digital_id"],
    bg_vendor: "uchecks",
  },
  {
    label: "Marcus Johnson (US)",
    user_id: "aa4aa4e3-2c25-4b79-91fe-cb4004f80a0e",
    email: "test.carer.us@specialcarer.com",
    country: "US",
    currency: "usd",
    bg_checks: ["us_criminal", "us_healthcare_sanctions"],
    bg_vendor: "checkr",
  },
];

async function ensureExpressAccount(c) {
  const { data: existing } = await supa
    .from("caregiver_stripe_accounts")
    .select("stripe_account_id, charges_enabled, payouts_enabled")
    .eq("user_id", c.user_id)
    .maybeSingle();

  let accountId = existing?.stripe_account_id;
  if (!accountId) {
    console.log(`  → creating Express account…`);
    const account = await stripe.accounts.create({
      controller: {
        stripe_dashboard: { type: "express" },
        fees: { payer: "application" },
        losses: { payments: "application" },
      },
      country: c.country,
      email: c.email,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      business_type: "individual",
      metadata: { specialcarer_user_id: c.user_id, test_seed: "true" },
    });
    accountId = account.id;

    await supa.from("caregiver_stripe_accounts").upsert(
      {
        user_id: c.user_id,
        stripe_account_id: accountId,
        country: c.country,
        default_currency: c.currency,
      },
      { onConflict: "user_id" },
    );
  } else {
    console.log(`  → reusing ${accountId}`);
  }

  // Always refresh capability state from Stripe and persist
  const fresh = await stripe.accounts.retrieve(accountId);
  await supa
    .from("caregiver_stripe_accounts")
    .update({
      charges_enabled: fresh.charges_enabled,
      payouts_enabled: fresh.payouts_enabled,
      details_submitted: fresh.details_submitted,
      requirements_currently_due: fresh.requirements?.currently_due ?? [],
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", c.user_id);

  return fresh;
}

async function freshOnboardingLink(accountId) {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${SITE_URL}/dashboard/payouts?refresh=1`,
    return_url: `${SITE_URL}/dashboard/payouts?onboarded=1`,
    type: "account_onboarding",
  });
  return link.url;
}

async function seedBackgroundChecks(c) {
  for (const check_type of c.bg_checks) {
    const { data: existing } = await supa
      .from("background_checks")
      .select("id")
      .eq("user_id", c.user_id)
      .eq("check_type", check_type)
      .maybeSingle();
    const payload = {
      user_id: c.user_id,
      vendor: c.bg_vendor,
      check_type,
      status: "cleared",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
      result_summary: "Seeded for test — auto-cleared",
      next_reverify_at: new Date(Date.now() + 365 * 86400 * 1000)
        .toISOString()
        .slice(0, 10),
      reverify_cadence_months: 12,
      reverify_status: "none",
      updated_at: new Date().toISOString(),
    };
    const { error: bgErr } = existing?.id
      ? await supa.from("background_checks").update(payload).eq("id", existing.id)
      : await supa.from("background_checks").insert(payload);
    if (bgErr) {
      throw new Error(`background_checks ${check_type}: ${bgErr.message}`);
    }
  }
}

async function main() {
  console.log("Seeding Stripe Express test accounts + onboarding links\n");
  const out = [];
  for (const c of CARERS) {
    console.log(`▶ ${c.label}`);
    const acct = await ensureExpressAccount(c);
    await seedBackgroundChecks(c);
    let url = null;
    if (!acct.charges_enabled || !acct.payouts_enabled) {
      url = await freshOnboardingLink(acct.id);
      console.log(`  → onboarding link: ${url}`);
    } else {
      console.log(`  ✓ already fully onboarded`);
    }
    console.log(
      `  charges_enabled=${acct.charges_enabled}  payouts_enabled=${acct.payouts_enabled}\n`,
    );
    out.push({
      label: c.label,
      email: c.email,
      account_id: acct.id,
      charges_enabled: acct.charges_enabled,
      payouts_enabled: acct.payouts_enabled,
      onboarding_url: url,
    });
  }

  console.log("\n=== SUMMARY ===\n");
  for (const r of out) {
    console.log(`${r.label}  (${r.account_id})`);
    console.log(`  charges=${r.charges_enabled}  payouts=${r.payouts_enabled}`);
    if (r.onboarding_url) console.log(`  ONBOARD: ${r.onboarding_url}`);
    console.log();
  }
  console.log(
    "After clicking each onboarding URL and completing Stripe's hosted form,",
  );
  console.log(
    "rerun this script — it'll show charges=true / payouts=true once done.",
  );
}

main().catch((e) => {
  console.error("✖", e?.raw?.message ?? e.message ?? e);
  process.exit(1);
});
