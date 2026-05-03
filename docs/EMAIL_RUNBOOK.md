# Email Infrastructure Runbook

## Architecture
- **Outbound (transactional)**: Supabase Auth → Resend SMTP → recipient
- **Inbound**: recipient@specialcarer.com → IONOS (mx00/mx01.ionos.co.uk) → forwarders → office@allcare4u.co.uk

## Resend
- Domain: `specialcarer.com` — Verified, region eu-west-1 (Ireland/Frankfurt)
- DNS records (in IONOS DNS panel):
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
- Sender email: `noreply@specialcarer.com`
- Sender name: `SpecialCarer`

## IONOS DNS (specialcarer.com root records)
- MX `@`: `mx00.ionos.co.uk`, `mx01.ionos.co.uk` (both priority 10) — DO NOT change to Google Workspace
- A `@` → 216.198.79.1 (Vercel)
- CNAME `www` → Vercel
- CNAME `_dmarc` → `dmarc.ionos.co.uk`

## IONOS Forwarders
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
- Symptom: inbound mail to *@specialcarer.com stops arriving.
- Fix: IONOS DNS panel → delete all aspmx.l.google.com MX records → add mx00.ionos.co.uk and mx01.ionos.co.uk priority 10.

## Test commands

Trigger OTP via Supabase:
```
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/otp" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@specialcarer.com","options":{"shouldCreateUser":false,"emailRedirectTo":"https://specialcarer.com/admin"}}'
```

Test SMTP credentials directly:
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
