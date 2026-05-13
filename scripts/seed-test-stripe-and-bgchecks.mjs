#!/usr/bin/env node
/**
 * Seed Stripe Connect (test-mode) + cleared background_checks for the
 * two test carers, so /api/stripe/create-booking-intent passes both
 * gates and end-to-end booking → PaymentElement → confirmPayment works.
 *
 * Run once:
 *   node scripts/seed-test-stripe-and-bgchecks.mjs
 *
 * Idempotent: reuses existing rows / Stripe accounts when present.
 *
 * Stripe test-mode magic values used here:
 *   - dob 1901-01-01           (no SSN/document required)
 *   - tos_acceptance now       (skips hosted onboarding)
 *   - GB bank: sort_code 108800 / account_number 00012345
 *   - US bank: routing 110000000 / account 000123456789
 *   - SSN last 4: 0000
 *   - ID-number: 000000000
 *   - Address: any non-empty (we use 1 Test Street)
 */

import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Load .env.local manually so we don't need a `dotenv` dependency.
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
} catch {
  // ok — env may already be present
}

const SECRET = process.env.STRIPE_SECRET_KEY;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SECRET || !SECRET.startsWith("sk_test_")) {
  console.error("✖ STRIPE_SECRET_KEY missing or not a test-mode key. Aborting.");
  process.exit(1);
}
if (!SUPA_URL || !SUPA_SVC) {
  console.error("✖ Supabase service role creds missing in .env.local");
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
    first_name: "Priya",
    last_name: "Sharma",
    bg_checks: ["enhanced_dbs_barred", "right_to_work", "digital_id"],
    address: {
      line1: "1 Test Street",
      city: "London",
      postal_code: "EC1A 1BB",
      country: "GB",
    },
    bank: {
      country: "GB",
      currency: "gbp",
      account_number: "00012345",
      routing_number: "10-88-00",
    },
  },
  {
    label: "Marcus Johnson (US)",
    user_id: "aa4aa4e3-2c25-4b79-91fe-cb4004f80a0e",
    email: "test.carer.us@specialcarer.com",
    country: "US",
    currency: "usd",
    first_name: "Marcus",
    last_name: "Johnson",
    bg_checks: ["us_criminal", "us_healthcare_sanctions"],
    address: {
      line1: "1 Test Street",
      city: "Austin",
      state: "TX",
      postal_code: "78701",
      country: "US",
    },
    bank: {
      country: "US",
      currency: "usd",
      account_number: "000123456789",
      routing_number: "110000000",
    },
    ssn_last_4: "0000",
    id_number: "000000000",
  },
];

async function ensureStripeAccount(c) {
  // 1) Re-use any existing row
  const { data: existing } = await supa
    .from("caregiver_stripe_accounts")
    .select("stripe_account_id, charges_enabled, payouts_enabled")
    .eq("user_id", c.user_id)
    .maybeSingle();

  let accountId = existing?.stripe_account_id;

  if (!accountId) {
    console.log(`  → creating Stripe Custom (platform-controlled) account for ${c.label}…`);
    // We use a platform-controlled (Custom-equivalent) account here ONLY for
    // seeded test carers so we can self-accept ToS without forcing the user
    // through hosted onboarding. Real prod carers still go through the
    // Express flow in /api/stripe/onboard-caregiver. PaymentIntent +
    // transfer_data.destination works identically against both types.
    const account = await stripe.accounts.create({
      controller: {
        stripe_dashboard: { type: "none" },
        fees: { payer: "application" },
        losses: { payments: "application" },
        requirement_collection: "application",
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
  } else {
    console.log(`  → reusing Stripe account ${accountId}`);
  }

  // 2) Populate all fields needed to make charges_enabled + payouts_enabled true
  console.log(`  → completing required fields…`);
  await stripe.accounts.update(accountId, {
    business_profile: {
      mcc: "8099", // Medical services
      product_description: "Caregiving services via SpecialCarer platform",
      url: "https://specialcarer.com",
    },
    individual: {
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      phone: c.country === "GB" ? "+447000000000" : "+15555550100",
      dob: { day: 1, month: 1, year: 1901 },
      address: c.address,
      ...(c.ssn_last_4 ? { ssn_last_4: c.ssn_last_4 } : {}),
      ...(c.id_number ? { id_number: c.id_number } : {}),
    },
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: "127.0.0.1",
    },
  });

  // 3) Attach external bank account (idempotent: skip if already present)
  const ext = await stripe.accounts.listExternalAccounts(accountId, {
    object: "bank_account",
    limit: 1,
  });
  if (ext.data.length === 0) {
    console.log(`  → attaching external bank account…`);
    await stripe.accounts.createExternalAccount(accountId, {
      external_account: {
        object: "bank_account",
        country: c.bank.country,
        currency: c.bank.currency,
        account_holder_name: `${c.first_name} ${c.last_name}`,
        account_holder_type: "individual",
        routing_number: c.bank.routing_number,
        account_number: c.bank.account_number,
      },
    });
  }

  // 4) Fetch fresh capability state
  const fresh = await stripe.accounts.retrieve(accountId);

  // 5) Persist to Supabase
  const row = {
    user_id: c.user_id,
    stripe_account_id: accountId,
    charges_enabled: fresh.charges_enabled,
    payouts_enabled: fresh.payouts_enabled,
    details_submitted: fresh.details_submitted,
    country: c.country,
    default_currency: c.currency,
    requirements_currently_due: fresh.requirements?.currently_due ?? [],
    updated_at: new Date().toISOString(),
  };
  await supa
    .from("caregiver_stripe_accounts")
    .upsert(row, { onConflict: "user_id" });

  return fresh;
}

async function seedBackgroundChecks(c) {
  console.log(`  → seeding cleared background_checks (${c.bg_checks.join(", ")})…`);
  for (const check_type of c.bg_checks) {
    // upsert by (user_id, check_type)
    const { data: existing } = await supa
      .from("background_checks")
      .select("id")
      .eq("user_id", c.user_id)
      .eq("check_type", check_type)
      .maybeSingle();

    const payload = {
      user_id: c.user_id,
      vendor:
        check_type.startsWith("us_") ? "checkr" : "uk_dbs",
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
    if (existing?.id) {
      await supa.from("background_checks").update(payload).eq("id", existing.id);
    } else {
      await supa.from("background_checks").insert(payload);
    }
  }
}

async function main() {
  console.log("Seeding Stripe Connect test accounts + background checks\n");
  for (const c of CARERS) {
    console.log(`▶ ${c.label}`);
    const acct = await ensureStripeAccount(c);
    await seedBackgroundChecks(c);
    console.log(
      `  ✓ ${acct.id}  charges_enabled=${acct.charges_enabled}  payouts_enabled=${acct.payouts_enabled}\n`,
    );
  }
  console.log("Done. Both test carers are now bookable end-to-end.");
}

main().catch((e) => {
  console.error("✖ Seeder failed:", e?.raw?.message ?? e.message ?? e);
  process.exit(1);
});
