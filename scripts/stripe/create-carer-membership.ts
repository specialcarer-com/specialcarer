/**
 * Idempotently create the Stripe Product + Price for the carer founder
 * membership (£4.99/month GBP recurring), and print the resulting price id.
 *
 * Safe to re-run: the Price is identified by its lookup_key
 * (carer_founder_monthly_v1). On re-run, if a Price with that lookup_key
 * already exists it is reused and reported — no duplicates are created.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe/create-carer-membership.ts
 * or, with .env.local present:
 *   npx tsx scripts/stripe/create-carer-membership.ts
 *
 * The checkout route (/api/billing/carer-checkout) resolves the Price at
 * runtime by this same lookup_key, so this script is the single source of
 * truth for the founder Price — no price id needs to be copied into env.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local (repo root) for local runs without exporting vars manually.
const envPath = resolve(__dirname, "..", "..", ".env.local");
if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const LOOKUP_KEY = "carer_founder_monthly_v1";
const PRODUCT_NAME = "SpecialCarer Founder Membership";
const UNIT_AMOUNT_PENCE = 499; // £4.99
const CURRENCY = "gbp";

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    console.error("STRIPE_SECRET_KEY is not set.");
    process.exit(1);
  }

  const stripe = new Stripe(secret, { apiVersion: "2026-04-22.dahlia" });

  // 1. Reuse an existing Price by lookup_key if present (re-run safe).
  const existing = await stripe.prices.list({
    lookup_keys: [LOOKUP_KEY],
    active: true,
    expand: ["data.product"],
    limit: 1,
  });
  if (existing.data.length > 0) {
    const price = existing.data[0];
    if (
      price.unit_amount !== UNIT_AMOUNT_PENCE ||
      price.currency !== CURRENCY ||
      price.recurring?.interval !== "month"
    ) {
      throw new Error(
        `Existing founder price ${price.id} does not match the founder contract ` +
          `(expected ${UNIT_AMOUNT_PENCE} ${CURRENCY}/month, got ` +
          `${price.unit_amount} ${price.currency}/${price.recurring?.interval}). ` +
          `Refusing to reuse a misconfigured price.`
      );
    }
    const product =
      typeof price.product === "string" ? price.product : price.product.id;
    console.log("Existing founder price found — reusing.");
    console.log(`  product:    ${product}`);
    console.log(`  price:      ${price.id}`);
    console.log(`  lookup_key: ${price.lookup_key}`);
    console.log(
      `  amount:     ${(price.unit_amount ?? 0) / 100} ${(price.currency ?? "gbp").toUpperCase()} / ${price.recurring?.interval}`
    );
    return;
  }

  // 2. Find-or-create the Product by name (avoids dup products on re-run after
  //    a Price was archived).
  const products = await stripe.products.search({
    query: `name:"${PRODUCT_NAME}" AND active:"true"`,
    limit: 1,
  });
  let productId: string;
  if (products.data.length > 0) {
    productId = products.data[0].id;
    console.log(`Reusing existing product ${productId}`);
  } else {
    const product = await stripe.products.create({
      name: PRODUCT_NAME,
      description:
        "Founding Carer membership — publish your public profile on the SpecialCarer marketplace and lock in the founder rate for life.",
      metadata: { kind: "carer_founder_membership" },
    });
    productId = product.id;
    console.log(`Created product ${productId}`);
  }

  // 3. Create the recurring Price with the lookup_key.
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: UNIT_AMOUNT_PENCE,
    currency: CURRENCY,
    recurring: { interval: "month" },
    lookup_key: LOOKUP_KEY,
    metadata: { kind: "carer_founder_membership" },
  });

  console.log("Created founder price.");
  console.log(`  product:    ${productId}`);
  console.log(`  price:      ${price.id}`);
  console.log(`  lookup_key: ${LOOKUP_KEY}`);
  console.log(`  amount:     ${UNIT_AMOUNT_PENCE / 100} ${CURRENCY.toUpperCase()} / month`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
