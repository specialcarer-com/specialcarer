# Email Infrastructure Runbook

> **Brand-singular migration status**: the platform brand is singular ("SpecialCarer").
> `specialcarer.com` has been verified in Resend since ~May 2026 (region eu-west-1,
> DKIM/SPF/MX all green, sending enabled) — the DNS work was done alongside the
> plural domain and the singular Resend domain was created 3 months before the
> code flip. What was actually blocking the code cutover was not DNS or Resend
> verification, but the code + config still hard-coding plural sender addresses.
> As of 3 Aug 2026 the transactional sender defaults have been flipped to singular
> in the code (`src/lib/email/smtp.ts` `DEFAULT_FROM`), and the Supabase Auth SMTP
> sender config has been updated to `noreply@specialcarer.com` via the Supabase
> dashboard. The plural domain `specialcarers.com` remains verified in Resend as
> a fallback but is no longer the default sender. See PRs #171-178 and the
> follow-up smtp.ts flip PR (audit at `/home/user/workspace/plural_email_audit.md`).

## Architecture
- **Outbound (transactional)**: Supabase Auth → Resend SMTP → recipient
- **Inbound**: recipient@specialcarer.com → IONOS (mx00/mx01.ionos.co.uk) → forwarders → office@allcare4u.co.uk

## Resend
- Domain: `specialcarer.com` (singular) — **CURRENT, Verified** (verified in Resend since ~May 2026, code default flipped 3 Aug 2026), region eu-west-1 (Ireland/Frankfurt).
- Domain: `specialcarers.com` (plural) — **Verified, historical/fallback** (verified in Resend since June 2026), same region. Retained so existing suppression-list state and any legacy senders remain valid; not the default sender any more.
- DNS records for singular (in IONOS DNS panel, against `specialcarer.com`):
  - TXT `resend._domainkey` → domain-specific DKIM public key (distinct from plural)
  - MX `send` → `feedback-smtp.eu-west-1.amazonses.com` priority 10
  - TXT `send` → `v=spf1 include:amazonses.com ~all`
- Plural DNS records remain in the plural zone unchanged — do not delete until we're comfortable retiring the plural sender identity entirely.
- API key: stored in `.env.local` as `RESEND_API_KEY` (sending-only, NO domain restriction — restricted keys fail SMTP auth with 535)
- Free tier: 3,000 emails/month, no card required

## Supabase Auth SMTP
- Host: `smtp.resend.com`
- Port: `465` (implicit TLS)
- Username: `resend`
- Password: the Resend API key
- Sender email: `noreply@specialcarer.com` — **CURRENT (singular)**. Cut over 3 Aug 2026; the singular Resend domain had already been verified for 3 months by that point. This is the Supabase Auth SMTP sender config; changed via the Supabase dashboard, not via code.
- Sender name: `SpecialCarer`

## IONOS DNS (specialcarer.com root records — CURRENT, singular)
- MX `@`: `mx00.ionos.co.uk`, `mx01.ionos.co.uk` (both priority 10) — DO NOT change to Google Workspace
- A `@` → IONOS parking IP (replace with Vercel apex when convenient)
- CNAME `www` → Vercel (`3d6750b6adc6c3ff.vercel-dns-017.com`)
- CNAME `_dmarc` → `dmarc.ionos.co.uk`
- Plural (specialcarers.com) zone kept intact for fallback — same MX/DKIM/SPF still resolvable.

## IONOS Forwarders (target: singular domain — confirm live before relying on these)
- admin@specialcarer.com → office@allcare4u.co.uk + stevegisanrin@aol.com
- noreply@specialcarer.com → office@allcare4u.co.uk
- hello@specialcarer.com → office@allcare4u.co.uk
- employers@specialcarer.com → office@allcare4u.co.uk
- privacy@specialcarer.com → office@allcare4u.co.uk

## Common issues

### OTP email not arriving
1. Check Resend Emails log (dashboard → Emails). If status = Suppressed, click in → "Remove from suppression list".
2. If status = Bounced, read the bounce reason.
3. If status = Delivered but recipient says no email, check IONOS Spam folder.
4. Check Supabase auth logs (Dashboard → Logs → Auth) for SMTP errors (status 500 / unexpected_failure).

### 535 Authentication credentials invalid (SMTP)
- API key has domain restriction. Create a new sending-only key with NO domain restriction.

### MX records changed away from IONOS
- Symptom: inbound mail to *@specialcarer.com (current, singular) stops arriving.
- Fix: IONOS DNS panel → delete all aspmx.l.google.com MX records → add mx00.ionos.co.uk and mx01.ionos.co.uk priority 10.

## Test commands

Trigger OTP via Supabase (uses the singular production domain):
```
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/otp" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@specialcarer.com","options":{"shouldCreateUser":false,"emailRedirectTo":"https://specialcarer.com/admin"}}'
```

Test SMTP credentials directly (singular sender/recipient):
```python
import smtplib, ssl
from email.message import EmailMessage
m = EmailMessage()
m["Subject"]="SMTP test"; m["From"]="noreply@specialcarer.com"; m["To"]="admin@specialcarer.com"
m.set_content("test")
with smtplib.SMTP_SSL("smtp.resend.com",465,context=ssl.create_default_context()) as s:
    s.login("resend", RESEND_API_KEY)
    s.send_message(m)
```
