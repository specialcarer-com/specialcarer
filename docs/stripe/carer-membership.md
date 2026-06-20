# Carer Founder Membership (Stripe £4.99/mo)

The carer founder membership is a recurring Stripe subscription (£4.99/month,
GBP) that unlocks publishing a carer's public marketplace profile. It is
**separate** from the consumer/family membership tiers (`lite`/`plus`/
`premium` in `public.subscriptions`) — carers get their own product, price, and
table (`public.carer_memberships`).

## Environment variables

Already configured in Vercel (no new vars needed for this feature):

| Var | Used by | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | create script, checkout/portal routes, webhook | Server-side Stripe API |
| `STRIPE_WEBHOOK_SECRET` | `/api/stripe/webhook` | Verify webhook signatures |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client | Stripe.js (not required for hosted Checkout redirect) |
| `NEXT_PUBLIC_SITE_URL` | checkout/portal routes | Build `success_url` / `cancel_url` / `return_url` |

## Creating the Stripe product + price

The Price is identified by its **lookup_key**, so nothing has to be copied into
env — the checkout route resolves the Price by lookup_key at runtime.

```bash
# with .env.local present, or pass STRIPE_SECRET_KEY inline
npx tsx scripts/stripe/create-carer-membership.ts
```

The script is idempotent: re-running reuses the existing Price/Product and
prints the ids. It creates:

- **Product:** `SpecialCarer Founder Membership`
- **Price:** £4.99/month GBP recurring, `lookup_key = carer_founder_monthly_v1`

### lookup_key

```
carer_founder_monthly_v1
```

Bump the suffix (`_v2`, …) only if the price changes — existing subscribers stay
on the old Price (their founder rate is "locked for life"); new checkouts use
whichever Price currently holds the lookup_key. Update
`CARER_FOUNDER_LOOKUP_KEY` in `src/lib/carer-membership/constants.ts` to match.

## API routes

| Route | Method | Description |
| --- | --- | --- |
| `/api/billing/carer-checkout` | POST | Auth carer (role=carer) → Stripe Checkout Session (subscription mode); returns `{ url }`. |
| `/api/billing/carer-portal` | POST | Auth carer → Stripe Billing Portal session for their customer; returns `{ url }`. |

`carer-checkout` wires the session with: `success_url`
`/m/carer/membership/success?session_id={CHECKOUT_SESSION_ID}`, `cancel_url`
`/m/carer/membership`, `client_reference_id` = carer user id,
`subscription_data.metadata.carer_user_id`, and `allow_promotion_codes: true`.

## Webhook events

Handled by the existing `/api/stripe/webhook` endpoint (same signature
verification — not duplicated). Carer subscriptions are detected by either the
price `lookup_key` or `metadata.carer_user_id`, then reconciled into
`public.carer_memberships` (one row per carer, upserted on `carer_user_id`):

| Event | Effect on `carer_memberships` |
| --- | --- |
| `checkout.session.completed` | Activate: upsert row with `status=active`, `stripe_subscription_id`, `current_period_end`. |
| `customer.subscription.updated` | Sync status (`active` / `past_due` / `canceled` / `incomplete` / `trialing`) + `current_period_end`. |
| `customer.subscription.deleted` | Mark `status=canceled`. |

Consumer (family) subscription events continue to flow to
`public.subscriptions` unchanged.

## Database

Migration: `supabase/migrations/20260618130000_carer_memberships.sql`

- Table `public.carer_memberships` (RLS: a carer reads only their own row;
  writes are service-role only via the webhook).
- Function `public.is_active_carer_member(user_id uuid) returns boolean` —
  `true` when the carer has `status='active'` and `current_period_end > now()`.

## Gating behaviour

Publishing a public profile (`POST /api/caregiver/profile { action: "publish" }`)
now requires an active membership:

- **New publishes** are gated on `is_active_carer_member(auth.uid())`. If the
  carer is not an active member the API returns `403` with
  `{ error, upgrade_url: "/m/carer/membership" }` and the editor shows an inline
  upgrade prompt.
- **Already-published profiles (grandfathered)** are not affected: the gate only
  applies when transitioning an *unpublished* profile to published. A carer who
  was already live before this feature stays live and can re-publish edits.
- `unpublish` is never gated.

## UI

`/m/carer/membership` (mobile-first, brand tokens only) renders three states:

1. **No membership** — "Become a Founding Carer" hero, £4.99/mo, benefits,
   "Start membership" CTA → POSTs to `carer-checkout`, redirects to Stripe.
2. **Active** — status card with renewal date + "Manage in Stripe" (Billing
   Portal).
3. **Past due / canceled** — explainer + re-subscribe CTA.

`/m/carer/membership/success` is the post-checkout landing (Stripe `success_url`).
