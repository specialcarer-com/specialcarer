# SpecialCarer Roadmap

**Last updated:** 12 July 2026
**Owner:** @BYHomeOwner
**Status:** Living document — update at the end of each sprint

---

## 1. Executive Summary

SpecialCarer is a UK-first home-care marketplace. As of 10 Jun 2026 the **end-to-end matching loop is live**: a seeker submits a booking → 5 carers are auto-matched and pushed → first-accept-wins (Now) or seeker-picks (Scheduled) → booking confirms → stale offers expire every 2 minutes. AI summarisation of carer shift notes, 9-locale UI (next-intl), in-app Stripe Checkout, push notifications, family chat, SOS, and care-plan PDF export are all shipped.

The next 8 weeks are about **closing the trust gap with Curam/Elder**, **adding the AI moat Cera owns**, and **opening the high-ticket live-in vertical**.

Sprints 1 & 2 (15 Jun – 10 Jul) have completed; see §4 for shipped items. Sprints 3 & 4 are re-scoped below.

### Three strategic themes for Q3 2026

| Theme | Why it matters | Headline outcomes |
|---|---|---|
| **T1. Trust & Conversion** | Curam wins first-time families on video-call-before-booking, biometric ID and CQC visibility. We lose enquiries we should be winning. | In-app video calls, biometric onboarding, CQC ratings on profiles, verified reviews, funding calculator |
| **T2. AI Moat** | Cera's "Predict & Prevent" is their defensible IP. We already have the data pipeline (care notes, visits, ratings) — we just haven't modelled it. | Visit recap push, predictive risk scoring, smarter ML matching, eMAR medication tracking |
| **T3. Vertical Expansion** | Hourly bookings cap us at the £20-30/hr segment. Live-in care is £1,150+/week. Same supply side, 10× ticket. | Live-in care vertical, overnight/respite journeys, B2B provider portal |

### KPIs we'll move
- **Time-to-first-booking** (seeker signup → confirmed booking) — proxy for matching quality
- **Carer offer-accept rate** — proxy for match relevance
- **Family Net Promoter Score** after first visit
- **Average booking value** — moves up with live-in vertical
- **Carer 30-day retention** — Honor's whole platform is built around this

---

## 2. The Sprint Plan (2-week sprints, 15 Jun – 7 Aug committed)

Sprints are **2 weeks**, starting Mondays. Each sprint has a **theme**, **must-ship items**, **stretch items**, and **acceptance criteria**. Effort estimates assume one engineer (you) + coding subagents.

> **Sprints 1 & 2 (15 Jun – 10 Jul 2026) completed** — see §4 for shipped items and PR references.

### Sprint 3: "AI Moat + In-App Calling"
**Dates:** Mon 13 Jul → Fri 24 Jul
**Theme:** Cera's predictive AI is their defensible IP. We have the data — start the model. Plus the single biggest conversion blocker: video calling before booking.

| # | Item | Source | Effort | Acceptance |
|---|------|--------|--------|------------|
| 3.1 | **Whereby video calling — reliability + observability** | Internal follow-up on #104/#105/#106 | ~1 day | Signature validation logs; failed-webhook alerting via Sentry; retry policy documented |
| 3.2 | **Predictive risk scoring V1** — daily job on `care_journal_entries` + booking outcomes; flag carer/recipient pairs needing review | Competitor (Cera "Predict & Prevent") | ~3 days | Admin dashboard shows top-20 flagged cases; precision/recall baseline measured |
| 3.3 | **eMAR — medication administration record** module on active job | Competitor (Cera) | ~2 days | Carer ticks each scheduled medication; family + admin see audit log |
| 3.4 | **Smarter ML matching V2** — extend Gap 19 rerank with retention/commute features | Competitor (Honor) | ~1 day | A/B test shows ≥10% lift in accept rate vs current rerank |

**Demo:** A family taps "Video call" on a carer profile, has a 5-minute chat, books them. After the first visit, the carer logs medications via eMAR. A week later, the admin dashboard flags one recipient as elevated fall risk from journal-entry signals.

---

### Sprint 4: "Live-in Vertical"
**Dates:** Mon 27 Jul → Fri 7 Aug
**Theme:** Open the £1,150/week ticket segment. Same supply, very different journey.

| # | Item | Source | Effort | Acceptance |
|---|------|--------|--------|------------|
| 4.1 | **Live-in care vertical** — separate booking journey, weekly pricing, 2-week minimum, replacement-carer logic | Competitor (Elder, Curam, Cera) | ~4 days | Seeker can search "Live-in care", filter by start date + duration, hire weekly carer |
| 4.2 | **Overnight + respite + emergency journeys** | Competitor (Elder) | ~2 days | Three new booking templates with appropriate scheduling rules |
| 4.3 | **Gap 36 — Carer earnings dashboard** (week/month/year, fees, BACS payout schedule, tax summary export) | Internal (Gap 36) | ~1 day | Carer can view + download CSV/PDF for accountant |
| 4.4 | **Gap 41 — Family timeline (shared activity feed)** | Internal (Gap 41) | ~2 days | All family-circle members see chronological feed of visits, notes, SOS, payments |

**Demo:** A family books an emergency live-in carer for 2 weeks while mum recovers from surgery. The carer sees the booking on their earnings dashboard with the BACS payout date. The wider family (3 siblings) all see the live timeline including last night's shift notes.

---

### Sprint 5 (placeholder): "Compliance & Safeguarding"
**Dates:** Mon 10 Aug → Fri 21 Aug (proposed)
**Theme:** UK regulator readiness. This lane needs founder input before committing items.

<!-- TBD: founder to specify concrete deliverables. Candidates flagged by review:
     - CQC registration deliverables (RI application, statement of purpose finalisation)
     - ICO / GDPR data-mapping (Article 30 records, DPIA for AI features)
     - Safeguarding incident reporting flow (in-app + LADO escalation)
     - DBS expiry tracking + automated renewal reminders
     Add rows to the table below when scoped.
-->

| # | Item | Source | Effort | Acceptance |
|---|------|--------|--------|------------|
| 5.x | *TBD — see comment above* | — | — | — |

---

### Sprint 6 (placeholder): "Payroll & BACS"
**Dates:** Mon 24 Aug → Fri 4 Sep (proposed)
**Theme:** First real payroll run. Depends on Lloyds BACS SUN outcome + Gusto Embedded decision.

<!-- TBD: founder to specify concrete deliverables. Candidates:
     - Lloyds BACS SUN application status milestone
     - Gusto Embedded go/no-go decision
     - First live payroll run for 3-carer pilot
     - HMRC PAYE / RTI submission automation
     See workspace briefs: lloyds_bacs_sun_brief, gusto_embedded_brief.
-->

| # | Item | Source | Effort | Acceptance |
|---|------|--------|--------|------------|
| 6.x | *TBD — see comment above* | — | — | — |

---

## 3. Beyond Sprint 4 — Backlog (Q4 2026 candidates)

Not committed; reviewed at end of each sprint.

| # | Item | Source | Effort | Strategic note |
|---|------|--------|--------|----------------|
| B1 | **GP / nurse / social worker portal** — care notes shared with named clinicians without exposing contact info | Competitor (Curam) | ~1 week | Major B2B / institutional sales hook |
| B2 | **B2B provider portal** — Curam Partnership / Found by Lottie equivalent | Competitor (Curam, Lottie) | ~2 weeks | Different product; new revenue line |
| B3 | **Employee benefits offering** — "Care as a workplace benefit" (Lottie's Seniorcare) | Competitor (Lottie) | ~1 week | B2B2C; mid-market employer sales |
| B4 | **Carer training courses platform** — free CPD courses, retention play | Competitor (Curam) | ~2 weeks | Supply-side retention; reduces churn |
| B5 | **Premium carer membership** — £8.99/mo for priority placement + waived screening fees | Competitor (Care.com) | ~3 days | New supply-side revenue line |
| B6 | **Social media background check** as £29.99 upsell | Competitor (Care.com) | ~2 days | Quick revenue, low effort |
| B7 | **HomePay-style payroll service** — handle tax/NI for self-funded families | Competitor (Care.com) | ~2 weeks | High-friction but high-value upsell |
| B8 | **Free expert concierge** (chat + phone) for first-time families | Competitor (Lottie, Elder) | Ongoing | Conversion-critical but hard to scale; consider AI-first version |
| B9 | **Funding guidance hub** (NHS CHC, council assessments, attendance allowance) | Competitor (Lottie) | ~1 week | SEO + first-touch trust |
| B10 | **Virtual tours / video profiles** of carers | Competitor (Lottie style, applied to carers) | ~3 days | Conversion lift on profile views |
| B11 | **Play Store — Internal Testing track first upload** | Internal (follow-up on #163–#165) | ~1 day | Play Console app registered, signed AAB uploaded, at least 1 tester group invited |

---

## 4. Already shipped (reference)

Cumulative as of 10 Jun 2026 — 80 PRs merged.

### Sprint 15 Jun – 10 Jul (Sprints 1 & 2)
- **Sprint 1 — Housekeeping + Conversion Quick Wins:**
  - PR C legacy LocaleContext migration for `/m` accessibility routes
  - Backfill `response_rate` + `completion_rate` (DB view + daily job)
  - Offer-expired push event (DispatchEvent union refactor + event)
  - Visit recap push extending [#78](https://github.com/specialcarer-com/specialcarer/pull/78)
  - Calendar sync (.ics export) — Gap 40
  - CQC ratings on carer profiles (public API + explainer)
- **Sprint 2 — Trust Hardening:**
  - **TOTP 2FA + AAL2 admin enforcement** ([#156](https://github.com/specialcarer-com/specialcarer/pull/156), [#158](https://github.com/specialcarer-com/specialcarer/pull/158))
  - SMS OTP login (Gap 14)
  - **Veriff liveness on carer onboarding** ([#107](https://github.com/specialcarer-com/specialcarer/pull/107), [#140](https://github.com/specialcarer-com/specialcarer/pull/140))
  - **Right-to-work verification** ([#133](https://github.com/specialcarer-com/specialcarer/pull/133), [#134](https://github.com/specialcarer-com/specialcarer/pull/134))
  - Verified reviews module on carer profiles
- **Biometric persistent sign-in (Face ID) via Capacitor Native Biometric** ([#108](https://github.com/specialcarer-com/specialcarer/pull/108), [#149](https://github.com/specialcarer-com/specialcarer/pull/149), [#150](https://github.com/specialcarer-com/specialcarer/pull/150), [#151](https://github.com/specialcarer-com/specialcarer/pull/151), [#152](https://github.com/specialcarer-com/specialcarer/pull/152), [#153](https://github.com/specialcarer-com/specialcarer/pull/153), [#154](https://github.com/specialcarer-com/specialcarer/pull/154), [#155](https://github.com/specialcarer-com/specialcarer/pull/155)) — confirmed working in production on iPhone 17 Pro Max
- **Whereby video calling — Embedded video-interview flow live** ([#104](https://github.com/specialcarer-com/specialcarer/pull/104), [#105](https://github.com/specialcarer-com/specialcarer/pull/105), [#106](https://github.com/specialcarer-com/specialcarer/pull/106))
- **Android Capacitor foundation** ([#163](https://github.com/specialcarer-com/specialcarer/pull/163), [#164](https://github.com/specialcarer-com/specialcarer/pull/164), [#165](https://github.com/specialcarer-com/specialcarer/pull/165)) — Java 21 Codemagic pipeline, CI signing bootstrap, Play upload workflows

### Sprint 8–10 Jun (recent)
- **Matching loop end-to-end** (PRs [#71](https://github.com/specialcarer-com/specialcarer/pull/71), [#72](https://github.com/specialcarer-com/specialcarer/pull/72), [#73](https://github.com/specialcarer-com/specialcarer/pull/73), [#74](https://github.com/specialcarer-com/specialcarer/pull/74), [#75](https://github.com/specialcarer-com/specialcarer/pull/75), [#76](https://github.com/specialcarer-com/specialcarer/pull/76), [#77](https://github.com/specialcarer-com/specialcarer/pull/77)) — Gap 17/18/19 + hybrid accept + expiry cron + geocode
- **Gap 4** — In-chat translation toggle ([#70](https://github.com/specialcarer-com/specialcarer/pull/70))
- **Gap 29** — Care-note AI summarisation ([#78](https://github.com/specialcarer-com/specialcarer/pull/78))
- **Gap 39** — In-app Stripe Checkout for memberships ([#69](https://github.com/specialcarer-com/specialcarer/pull/69))
- **Gap 43** — Multi-language UI, 9 locales ([#79](https://github.com/specialcarer-com/specialcarer/pull/79), [#80](https://github.com/specialcarer-com/specialcarer/pull/80))
- Marketing hero animations ([#68](https://github.com/specialcarer-com/specialcarer/pull/68)), brand refresh ([#64](https://github.com/specialcarer-com/specialcarer/pull/64)/[#65](https://github.com/specialcarer-com/specialcarer/pull/65)/[#67](https://github.com/specialcarer-com/specialcarer/pull/67))

### Foundations (24 May – 7 Jun)
- Push notifications + Expo delivery + inbox + bell badge
- Chat: 1:1 + family group, attachments, quick replies, moderation, pinning, auto-archive
- SOS button + push notification
- Active-job task checklist with realtime mirror
- Care-plan PDF export + medications/allergies schema
- Quick-rebook tiles
- Real bookings/search APIs (off mock data)
- Branded Supabase auth emails + auth callback hardening
- UK-only region gating
- Apple Pay domain association
- CodeRabbit + CODEOWNERS governance

---

## 5. Operational notes

- **Subagent infrastructure** has had intermittent disk-pressure + GitHub-auth-proxy issues across the sprint. Engineering notified. Workaround: admin-merge when base-branch policy false-blocks; subagents symlink `node_modules` from sibling clones.
- **Perplexity Max** renewal — 27 Jun 2026 (£200/mo) — reminder cron set
- **Standup brief cron** — weekdays 7:30am London — active
- **TikTok display name** — updated to `SpecialCarers` (done 10 Jun)
- **Android** — Capacitor foundation + CI signing + Play workflows shipped (#163/#164/#165); Play Console Internal Testing track upload pending (see B11)

---

## 6. How this doc is maintained

- **End of each sprint:** move shipped items into §4, refresh §2 with the next sprint
- **Mid-sprint:** add new items to §3 backlog only — don't disrupt the active sprint
- **Quarterly:** revisit §1 themes & KPIs against actual data
- **Source of truth:** this file in `main`. Forks should rebase before editing.
