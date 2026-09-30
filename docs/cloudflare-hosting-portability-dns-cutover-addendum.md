> **Merge note:** this is a new, separate section for
> `docs/cloudflare-hosting-portability.md` - add it after "## Scheduler
> cutover" and before "## Remaining gates and next order", or as its own
> `docs/dns-domain-cutover.md` if that reads better once merged. Delete
> this file once merged.

## DNS / domain cutover plan (draft - blocked on one open question)

**Status: draft, not ready to execute.** Investigated by reading the app
code's own domain references and `docs/EMAIL_RUNBOOK.md` directly (30
September), and by trying to confirm the live domain via the connected
Vercel tools. One real, unresolved discrepancy came out of that which has
to be settled by someone with actual Vercel/IONOS dashboard access before
any DNS work starts - see "Open question" below. Everything else in this
plan is written so it applies correctly once that's answered, but the
exact hostnames in step 3 depend on the answer.

### Open question: which domain is actually live? (must resolve first)

Two domains appear throughout this codebase, and they are not
interchangeable:

- **`specialcarers.com` (plural)** - referenced as the live web/mobile
  origin almost everywhere: the Capacitor `serverUrl` default, both
  native WebShell origins, Android `AndroidManifest.xml` App Links
  (`android:host="specialcarers.com"` / `www.specialcarers.com`), the
  `.well-known/assetlinks.json` comment, App Store/Play Store listing
  URLs (privacy, terms, account deletion), the auth callback's own
  comment ("Supabase's confirmation email button always lands on the
  configured Site URL (`https://specialcarers.com/auth/callback`)"),
  the cookies page's own documented cookie domains, the MSA contract
  text, and the ICS calendar's default UID domain.
- **`specialcarer.com` (singular)** - per `docs/EMAIL_RUNBOOK.md`,
  this is the **current transactional email sender domain** (Resend +
  Supabase Auth SMTP sender, flipped 3 Aug 2026) and has its own IONOS
  DNS records (MX, DKIM, SPF, DMARC). The runbook labels IONOS's
  singular-domain records "CURRENT" - but that label is about which
  domain **sends mail**, not which domain **the website itself runs
  on**. `docs/cloudflare-hosting-portability.md`'s own env var table
  uses `https://www.specialcarer.com` (singular) as an *example*
  `APP_ORIGIN` value, which may have quietly seeded an assumption into
  the Cloudflare migration work that doesn't match what the mobile apps
  and most of the web app actually point at.

I tried to resolve this directly rather than guess: the connected
Vercel MCP tools can list the `specialcarer` project
(`prj_zw71olfwhlT8A19blweVjOcaMQBI`, team `team_b48cuSjt8X7OxdaCRNpfaZC0`),
but `list_project_domains` and `get_project` both fail with 403
(`"Not authorized: Trying to access resource under scope 'ac4u'"`) - the
connected credential is authenticated against a different
team/scope than the one that owns this project, so I cannot read its
actual configured domains from here. This is the same shape of access
gap `cloudflare-hosting-portability.md`'s "Remaining gates" item 1
already flagged for the Cloudflare side ("no accessible SpecialCarer
zone") - it now appears to affect the Vercel side too.

**Before any step below executes, a human with real Vercel dashboard
access needs to check Project Settings \> Domains on the `specialcarer`
project and confirm which hostname(s) are actually attached and set as
production** (most likely `specialcarers.com` + `www.specialcarers.com`
given the weight of evidence above, but confirm rather than assume).
The email-domain migration (singular) and the website-domain identity
(apparently still plural) are two separate, only loosely related
decisions - this plan should not silently collapse them into one.

### Prerequisite: an active Cloudflare zone (confirmed via Cloudflare's own docs)

Workers [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
require "an active Cloudflare zone" - meaning the domain's nameservers
must be delegated to Cloudflare, not just a CNAME added while IONOS stays
authoritative. (A CNAME-only path exists via Cloudflare for SaaS custom
hostnames, but that's a different product aimed at multi-tenant SaaS
routing, not evaluated here - full nameserver delegation is the standard
path and what the rest of this plan assumes.) This confirms the existing
"no accessible SpecialCarer zone in this account" note in this doc's
Remaining Gates section is the literal first blocking step for domain
work, not a minor housekeeping gap: **someone needs to create a zone for
the confirmed domain in the Cloudflare account before anything else in
this plan can be tested for real**, even in a dry-run/staging sense.

### What must be recreated, not just "preserved", before nameservers move

Moving nameservers to Cloudflare makes Cloudflare authoritative for
*every* record on that zone, not just the web app's. Per
`docs/EMAIL_RUNBOOK.md`, IONOS currently holds, for the confirmed live
domain:

- MX `@` -> `mx00.ionos.co.uk`, `mx01.ionos.co.uk` (priority 10 both) -
  the runbook explicitly warns **do not change to Google Workspace**.
- TXT `resend._domainkey` -> domain-specific DKIM public key.
- MX `send` -> `feedback-smtp.eu-west-1.amazonses.com` (priority 10) and
  TXT `send` -> `v=spf1 include:amazonses.com ~all` (Resend's sending
  records).
- CNAME `_dmarc` -> `dmarc.ionos.co.uk`.
- The IONOS mail forwarders (`admin@`, `noreply@`, `hello@`,
  `employers@`, `privacy@` -> `office@allcare4u.co.uk` /
  `stevegisanrin@aol.com`) - these live at the IONOS mailbox/forwarder
  layer, not as DNS records Cloudflare would take over, but losing MX
  routing to IONOS during a cutover would break them functionally even
  though the forwarder config itself is untouched.
- If the plural domain turns out to be the live web domain (see above),
  its own DNS zone - the runbook says its MX/DKIM/SPF are "still
  resolvable" but doesn't give the exact record values the way it does
  for the singular domain; those need pulling from IONOS directly before
  cutover, not assumed identical to the singular domain's.

None of this is Cloudflare-specific risk - it's the standard risk of any
nameserver migration - but it means step-by-step record recreation in
Cloudflare DNS, verified value-by-value against IONOS, has to happen
**before** nameservers move, not discovered as breakage afterward.

### Also affected: mobile app domain verification

Android App Links (`/.well-known/assetlinks.json`) and iOS Associated
Domains (`applinks:specialcarers.com`, referenced in
`mobile/ios-overlay/README.md`) depend on that well-known file
continuing to resolve correctly through whichever infrastructure serves
the domain after cutover. `src/app/.well-known/assetlinks.json/route.ts`
is app code (so it moves with whatever Worker serves the domain), but
both app stores cache verification results - a domain-serving change is
worth re-verifying deliberately afterward, not just assumed to carry
over silently.

### Outline procedure (sequencing only - exact hostnames pending the open question above)

1. Resolve the open question above with a human who has real Vercel/IONOS
   access.
2. Create a Cloudflare zone for the confirmed domain. Do **not** change
   nameservers yet - a zone can exist and be populated before it's live.
3. Recreate every existing IONOS record in the new Cloudflare zone,
   confirmed value-by-value (MX, DKIM, SPF, DMARC, and any other
   subdomain records not yet enumerated here - the IONOS panel is the
   source of truth, not this doc).
4. Confirm a real (non-synthetic, non-preview) production Worker exists
   to route to. As of this investigation, only `specialcarer-preview`
   exists in the Cloudflare account, which this doc's own "Remaining
   gates" item 2 already notes is not yet a functional production
   candidate - domain cutover cannot target a Worker that doesn't exist
   yet in production form.
5. Add the Workers Custom Domain for the confirmed apex and `www` host
   (both need their own Custom Domain entry - Custom Domains match
   exact hostnames only, so a redirect rule is also needed for whichever
   of apex/`www` isn't the canonical one, per Cloudflare's own docs).
6. Lower IONOS DNS TTLs on the affected records ahead of the actual
   cutover window, so a rollback (below) resolves quickly if needed.
7. Switch nameservers at the registrar to Cloudflare's assigned pair.
8. Verify: DNS propagation, TLS certificate issuance on the new zone,
   every recreated record resolving correctly (mail flow, forwarders,
   DKIM/SPF/DMARC), the web app serving correctly end-to-end, and the
   mobile apps' domain verification still passing.
9. **Rollback plan**: revert the registrar's nameservers back to IONOS.
   Because IONOS's zone is never deleted, only deprioritized at the
   registrar level during this process, reverting nameservers restores
   the exact prior state once the (now-lowered) TTL expires - no data
   loss, no record reconstruction needed on the way back.

Nothing in this plan has been executed. No Cloudflare zone, DNS record,
or nameserver has been created or changed as part of this investigation.
