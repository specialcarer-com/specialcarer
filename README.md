# SpecialCarer

Trusted care, on your schedule. On-demand and scheduled childcare, elder care, and home support — UK and US.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **Tailwind CSS** for styling
- **Supabase** for Postgres, auth, and realtime
- **Vercel** for hosting

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in your Supabase keys
cp .env.example .env.local
# Edit .env.local with values from
# https://supabase.com/dashboard/project/<id>/settings/api

# 3. Apply database migrations
# Open Supabase SQL Editor for your dev project, paste the contents of
# supabase/migrations/0001_init.sql, and run.

# 4. Start the dev server
npm run dev
```

Visit http://localhost:3000

## Project structure

```
src/
  app/                  # Next.js App Router pages
    page.tsx            # Marketing homepage with waitlist
    api/waitlist/       # POST endpoint that writes to public.waitlist
  lib/supabase/         # Server + client Supabase factories
supabase/
  migrations/           # SQL schema migrations (apply manually in dev)
```

## Environments

- **Development:** Supabase project `carelink-dev` (free tier, London region)
- **Staging:** TBD (create when ready to upgrade Supabase to Pro)
- **Production:** TBD (same)

## Deployment

Pushed to `main` → auto-deploys to Vercel → live at `specialcarer.com`.

### Cutting an iOS TestFlight build

Use `./scripts/cut-ios-tag.sh` — never raw `git tag ios-v*`. Tags trigger
Codemagic's TestFlight upload, and Apple's daily upload cap (ITMS-90382)
gets tripped fast if tags are cut for web-only changes. See
[`docs/ios-release-runbook.md`](docs/ios-release-runbook.md) for the
policy and the post-incident background.

## Next steps

- [ ] Apply `0001_init.sql` migration in Supabase
- [ ] Add Supabase env vars in Vercel
- [ ] Point `specialcarer.com` from IONOS to Vercel
- [ ] Build seeker / caregiver auth flows
- [ ] Wire up Stripe Connect, Mapbox, Twilio (post-launch checklist)
