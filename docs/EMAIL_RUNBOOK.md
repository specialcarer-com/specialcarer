# Email Infrastructure Runbook

> **Brand-singular migration status (as of this doc update)**: the platform brand is
> singular ("SpecialCarer"), but Resend's verified sending domain, DKIM/SPF records,
> and the Supabase Auth SMTP sender are still provisioned against the **plural**
> `specialcarers.com` domain. Singular (`specialcarer.com`) is **PENDING RESEND SETUP**
> — do not flip any `from:`/SMTP-sender config to singular until a verified
> `specialcarer.com` Resend domain with passing DKIM/SPF/DMARC exists. See PRs #171-176
> and the comprehensive sweep PR (ref `/home/user/workspace/plural_email_audit.md`).
> Inbound contact aliases (forwarders below) have been updated to the singular domain
> as the target state — confirm the IONOS mailboxes/forwarders for `specialcarer.com`
> exist before relying on them in production.

## Architecture
- **Outbound (transactional)**: Supabase Auth → Resend SMTP → recipient
- **Inbound**: recipient@specialcarer.com → IONOS (mx00/mx01.ionos.co.uk) → forwarders → office@allcare4u.co.uk

## Resend
- Domain: `specialcarers.com` (plural) — **CURRENT, Verified**, region eu-west-1 (Ireland/Frankfurt).
  `specialcarer.com` (singular) is **PENDING** — not yet added/verified in Resend.
- DNS records (in IONOS DNS panel, against the plural domain):
  - TXT `resend._domainkey` → `p=MIGfMA0GCSqGSIb3...` (DKIM)
  - MX `send` → `feedback-smtp.eu-west-1.amazonses.com` priority 10
  - TXT `send` → `v=spf1 include:amazonses.com ~all`
- API key: stored in `.env.local` as `RESEND_API_KEY` (sending-only, NO domain restriction — restricted keys fail SMTP auth with 535)
- Free tier: 3,000 emails/month, no card required

## Supabase Auth SMTP
- Host: `smtp.resend.com`
- Port: `465` (implicit TLS)
- Username: `resend`
- Password: the Resend API key
- Sender email: `noreply@specialcarers.com` — **CURRENT (plural)**. Stays plural until
  the singular Resend domain above is verified; this is the Supabase Auth SMTP
  sender config, out of scope for the code-level brand-singular sweep.
- Sender name: `SpecialCarer`

## IONOS DNS (specialcarers.com root records — CURRENT, plural)
- MX `@`: `mx00.ionos.co.uk`, `mx01.ionos.co.uk` (both priority 10) — DO NOT change to Google Workspace
- A `@` → 216.198.79.1 (Vercel)
- CNAME `www` → Vercel
- CNAME `_dmarc` → `dmarc.ionos.co.uk`

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
- Symptom: inbound mail to *@specialcarers.com (current, plural) stops arriving.
- Fix: IONOS DNS panel → delete all aspmx.l.google.com MX records → add mx00.ionos.co.uk and mx01.ionos.co.uk priority 10.

## Test commands

Trigger OTP via Supabase (uses the current, plural production domain — update to
singular once the redirect target and mailboxes are cut over):
```
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/otp" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@specialcarers.com","options":{"shouldCreateUser":false,"emailRedirectTo":"https://specialcarers.com/admin"}}'
```

Test SMTP credentials directly (current, plural sender/recipient — see status note at
top of this doc):
```python
import smtplib, ssl
from email.message import EmailMessage
m = EmailMessage()
m["Subject"]="SMTP test"; m["From"]="noreply@specialcarers.com"; m["To"]="admin@specialcarers.com"
m.set_content("test")
with smtplib.SMTP_SSL("smtp.resend.com",465,context=ssl.create_default_context()) as s:
    s.login("resend", RESEND_API_KEY)
    s.send_message(m)
```
