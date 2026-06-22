# SpecialCarer email templates

Branded Supabase Auth transactional email templates. These are the **source of
truth** for what is configured in the live Supabase project.

## What's here

| File | Supabase template | Trigger |
|---|---|---|
| `recovery.html`     | Password recovery   | User clicks "Forgot password" |
| `confirmation.html` | Signup confirmation | User signs up with email + password |
| `magic_link.html`   | Magic link sign-in  | User signs in with magic-link only |
| `email_change.html` | Email change        | User changes their account email |
| `invite.html`       | Admin invite        | Admin invites a user via dashboard |

## Brand spec

- **Font:** Plus Jakarta Sans → Inter → Arial fallback
- **Colours:** teal `#039EA0` · accent `#F4A261` · cream `#F4EFE6` · ink `#0F1416` · soft-grey `#6B7280`
- **Logo:** `https://specialcarers.com/brand/logo-wordmark-email.png` (960×721 PNG, displayed at 200×150)
- **Max width:** 560px

## Supabase template variables used

- `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=<flow>` — server-side action URL routed through our Next.js callback (primary CTA). The `type` parameter must match the flow: `recovery` for password reset, `signup` for confirmation, `magiclink` for magic links, `email_change` for email change, `invite` for invites. NEVER use `{{ .ConfirmationURL }}` directly — that points to Supabase's own /verify endpoint and bypasses our callback's branching logic (e.g. routing recovery flows to /auth/reset-password).
- `{{ .Token }}` — 6-digit OTP fallback (recovery template only)
- `{{ .Email }}` — recipient email
- `{{ .NewEmail }}` — new email (email_change template only)

## How to update

1. Edit the HTML file(s) in this directory.
2. Open a PR. Get it reviewed. Merge to `main`.
3. Go to GitHub Actions → "Install Supabase email templates" → **Run workflow** → leave
   `project_ref` as `qupjaanyhnuvlexkwtpq` → run.
4. Verify in the [Supabase Dashboard](https://supabase.com/dashboard/project/qupjaanyhnuvlexkwtpq/auth/templates).

## Reset to defaults

If a template breaks production email, manually clear it in the Supabase Dashboard
template editor. Then re-run the workflow once fixed.
