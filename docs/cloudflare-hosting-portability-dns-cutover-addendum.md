> **Merge note:** this is a new, separate section for
> `docs/cloudflare-hosting-portability.md` - add it after "## Scheduler
> cutover" and before "## Remaining gates and next order", or as its own
> `docs/dns-domain-cutover.md` if that reads better once merged. Delete
> this file once merged.

## DNS / domain cutover plan (draft - domain confirmed, zone still needed)

**Status: draft.** The domain question below is now resolved by a human
checking the real Vercel dashboard; the remaining blocker is that no
Cloudflare zone exists yet for the confirmed domain (see "Prerequisite"
below) - nothing in this plan has been executed.

### Domain - resolved (30 September, via Vercel dashboard screenshot)

**`www.specialcarer.com` (singular) is the real production domain.**
Confirmed directly from the Vercel dashboard's Project Overview for
`specialcarer` (team **ALLCARE4U**, `team_b48cuSjt8X7OxdaCRNpfaZC0`):
Production Deployment \> Domains lists `www.specialcarer.com` and the
Vercel-assigned fallback `specialcarer.vercel.app`. The "Add Custom
Domain" step is checked off in the Production Checklist. This settles
the question the earlier draft of this doc raised - the singular domain
is both the current email-sending domain (per `EMAIL_RUNBOOK.md`) *and*
the actual live web domain, not two separate things as first suspected.

The connected Vercel MCP token's `list_project_domains`/`get_project`
calls still returned 403 (`scope "ac4u"`) even though the team shown in
the dashboard (ALLCARE4U) matches that scope - so this was not a
wrong-team credential as first guessed, but looks like a narrower
per-endpoint permission gap on that specific token. Worth re-testing
those calls if broader Vercel access is ever needed from this session,
but it no longer blocks this plan - a human confirmed the answer
directly from the dashboard.

**New, separate finding - not part of this DNS plan, flagged for its own
follow-up:** if `www.specialcarer.com` (singular) is genuinely
production, then every mobile surface in this repo is still hardcoded to
the **plural** `specialcarers.com`: the Android manifest's App Links
(`android:host="specialcarers.com"`/`www.specialcarers.com`), iOS
Associated Domains (`applinks:specialcarers.com`), the Capacitor
`serverUrl` default, the Expo `app.json` `webOrigin`, and both native
`WebShell`/deeplink origin defaults. Either the native apps are
currently loading the wrong domain (a real bug, not just stale docs), or
there's a redirect from plural to singular somewhere that makes it work
by accident - worth checking directly rather than assuming either way.
This is independent of the Cloudflare DNS cutover and shouldn't block it,
but belongs on someone's list.

### Prerequisite: an active Cloudflare zone (confirmed via Cloudflare's own docs)

Workers [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
require "an active Cloudflare zone" - meaning `specialcarer.com`'s
nameservers must be delegated to Cloudflare, not just a CNAME added
while IONOS stays authoritative. (A CNAME-only path exists via
Cloudflare for SaaS custom hostnames, but that's a different product
aimed at multi-tenant SaaS routing, not evaluated here - full
nameserver delegation is the standard path and what the rest of this
plan assumes.) This confirms the existing "no accessible SpecialCarer
zone in this account" note in this doc's Remaining Gates section is the
literal first blocking step for domain work, not a minor housekeeping
gap: **someone needs to create a zone for `specialcarer.com` in the
Cloudflare account before anything else in this plan can be tested for
real**, even in a dry-run/staging sense.

### What must be recreated, not just "preserved", before nameservers move

Moving nameservers to Cloudflare makes Cloudflare authoritative for
*every* record on that zone, not just the web app's. Per
`docs/EMAIL_RUNBOOK.md`, IONOS currently holds, for `specialcarer.com`:

- MX `@` -> `mx00.ionos.co.uk`, `mx01.ionos.co.uk` (priority 10 both) -
  the runbook explicitly warns **do not change to Google Workspace**.
- TXT `resend._domainkey` -> domain-specific DKIM public key.
- MX `send` -> `feedback-smtp.eu-west-1.amazonses.com` (priority 10) and
  TXT `send` -> `v=spf1 include:amazonses.com ~all` (Resend's sending
  records).
- CNAME `_dmarc` -> `dmarc.ionos.co.uk`.
- CNAME `www` -> Vercel (`3d6750b6adc6c3ff.vercel-dns-017.com`) - this is
  the record a Workers Custom Domain will eventually replace; recreate
  everything else first, change this one last, deliberately.
- The IONOS mail forwarders (`admin@`, `noreply@`, `hello@`,
  `employers@`, `privacy@` -> `office@allcare4u.co.uk` /
  `stevegisanrin@aol.com`) - these live at the IONOS mailbox/forwarder
  layer, not as DNS records Cloudflare would take over, but losing MX
  routing to IONOS during a cutover would break them functionally even
  though the forwarder config itself is untouched.

None of this is Cloudflare-specific risk - it's the standard risk of any
nameserver migration - but it means step-by-step record recreation in
Cloudflare DNS, verified value-by-value against IONOS, has to happen
**before** nameservers move, not discovered as breakage afterward.

### Also affected: mobile app domain verification

Android App Links (`/.well-known/assetlinks.json`) and iOS Associated
Domains depend on that well-known file continuing to resolve correctly
through whichever infrastructure serves the domain after cutover.
`src/app/.well-known/assetlinks.json/route.ts` is app code (so it moves
with whatever Worker serves the domain), but both app stores cache
verification results - a domain-serving change is worth re-verifying
deliberately afterward. This is separate from, and shouldn't be
conflated with, the plural-vs-singular mobile hardcoding issue flagged
above - fix that first, independently, so the mobile apps are even
pointed at the right domain before its infrastructure changes under it.

### Outline procedure

1. Create a Cloudflare zone for `specialcarer.com`. Do **not** change
   nameservers yet - a zone can exist and be populated before it's live.
2. Recreate every existing IONOS record in the new Cloudflare zone,
   confirmed value-by-value: the MX/DKIM/SPF/DMARC records above, plus
   any other subdomain records not yet enumerated here (the IONOS panel
   is the source of truth, not this doc).
3. Confirm a real (non-synthetic, non-preview) production Worker exists
   to route to. As of this investigation, only `specialcarer-preview`
   exists in the Cloudflare account, which this doc's own "Remaining
   gates" item 2 already notes is not yet a functional production
   candidate - domain cutover cannot target a Worker that doesn't exist
   yet in production form.
4. Add the Workers Custom Domain for `specialcarer.com` and
   `www.specialcarer.com` (both need their own Custom Domain entry -
   Custom Domains match exact hostnames only, so a redirect rule is also
   needed for the apex, since `www` is canonical per the current Vercel
   CNAME).
5. Lower IONOS DNS TTLs on the affected records ahead of the actual
   cutover window, so a rollback (below) resolves quickly if needed.
6. Switch nameservers at the registrar to Cloudflare's assigned pair.
7. Verify: DNS propagation, TLS certificate issuance on the new zone,
   every recreated record resolving correctly (mail flow, forwarders,
   DKIM/SPF/DMARC), the web app serving correctly end-to-end, and (once
   the mobile hardcoding issue above is separately fixed) the mobile
   apps' domain verification still passing.
8. **Rollback plan**: revert the registrar's nameservers back to IONOS.
   Because IONOS's zone is never deleted, only deprioritized at the
   registrar level during this process, reverting nameservers restores
   the exact prior state once the (now-lowered) TTL expires - no data
   loss, no record reconstruction needed on the way back.

Nothing in this plan has been executed. No Cloudflare zone, DNS record,
or nameserver has been created or changed as part of this investigation.
