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

### Sprint 5: "Compliance & Safeguarding"
**Dates:** Mon 10 Aug → Fri 21 Aug
**Theme:** UK regulator readiness. CQC submission-ready evidence pack, ICO Article 30 record + AI DPIA published, live in-app safeguarding incident flow with escalation rota, and DBS operational continuity while uCheck RO approval is pending.

| # | Item | Source | Effort | Acceptance |
|---|------|--------|--------|------------|
| 5.1 | **CQC next-tranche pack — draft + internal review** | Internal (CQC prep) | ~2 days | Four new documents drafted using existing `build_*.py` helpers: Duty of Candour (SC-POL-10), Freedom to Speak Up / Whistleblowing (SC-POL-11), Risk Assessment register (SC-DOC-06), Person-Centred Care policy. All cross-consistent on carer pay (£14/£21/£28), SE-London launch area, £200K opening capital, three-tier clinical workforce. Bundled as `specialcarer_cqc_pack_v1_5.zip`. Reviewed and approved by RM Victoria Oluwaseun. |
| 5.2 | **CQC submission-ready checklist + evidence pack finalisation** | Internal (CQC prep) | ~1 day | Written checklist covering: v1.x + v1.5 pack merged, Statement of Purpose finalised, RI Fit Person interview prep notes, insurance evidence attached, financial forecast attached, Safeguarding Lead named, DBS/RTW/references for RM and NI attached. Each row ticked or explicitly deferred with owner + date. Portal submission moves to stretch (5.8) once checklist is 100% ticked. |
| 5.3 | **DBS operational continuity — manual path documented, uCheck chase automated** | Internal (Gap: DBS-1 manual) | ~1 day | Runbook `docs/operations/dbs-manual-recheck.md` describes end-to-end manual admin flow via secure.crbonline.gov.uk with screenshots. Weekly cron chases uCheck RO team via templated email until approval or rejection. Existing `DbsProvider` automation code untouched; ready to flip on approval. |
| 5.4 | **Safeguarding incident reporting flow (in-app) with escalation rota** | Internal (Gap: safeguarding) | ~2 days | New `/m/report` route: form captures type / severity / subject / narrative / LADO-required flag. Writes to `safeguarding_incidents` table with immutable audit log. Notification rota: (1) push + email to RM Victoria immediately, (2) auto-escalate to NI Steve if no acknowledgement within 15 min, (3) tertiary alert to `safeguarding@` shared inbox. LADO 24-hour reminder queued when flag is set. Test incident → all three tiers verified in staging. |
| 5.5 | **DBS expiry tracking + automated renewal reminders** | Internal | ~1 day | Nightly cron flags carers whose DBS certificate expires in ≤60 days. Carer receives push + email at 60/30/14/7 days. Admin dashboard has "Expiring DBS" view with sort by days-remaining. Independent of uCheck outcome — works with the current manual path. |
| 5.6 | **ICO Article 30 records + AI DPIA** | Internal (ICO/GDPR) | ~1 day | Article 30 register published to `docs/compliance/records-of-processing.md` covering all data flows. Separate DPIA covering AI features (care-note summarisation #78, planned predictive risk V1 in 3.2, planned ML matching V2 in 3.4): legal basis, necessity + proportionality test, data minimisation, retention, subject-rights process, DPO contact. Both documents versioned and dated. |
| 5.7 | **Safeguarding poster ack on carer sign-in** | Internal | ~½ day | Modal on next carer sign-in requires acknowledgement of the current `specialcarer_safeguarding_poster` version. Ack stored with `carer_id`, `poster_version`, timestamp. Blocks app usage until acknowledged. Coverage report available in admin dashboard. |
| **Stretch 5.8** | **CQC portal submission** | Internal | ~½ day | If checklist 5.2 comes back 100% ticked with time to spare, submit to CQC portal. Reference number captured, RM interview date booked. Otherwise carries to Sprint 6 opening. |

**Demo at end of sprint:** RM Victoria receives a test safeguarding push within 60 seconds of a mock incident being submitted; the LADO 24-hour reminder is visible in her admin dashboard queue; the CQC pack v1.5 zip is generated and attached to the submission-ready checklist which shows every row ticked; a carer with a DBS expiring in 55 days sees the renewal banner on next app open; the Article 30 register and AI DPIA are live under `/docs/compliance/`.

**Total committed effort:** ~8.5 dev-days (5.1–5.7) across 10 working days. Stretch 5.8 depends on 5.2 outcome.

**Dependencies / risks:**
- 5.3 depends on uCheck responding; if no response by end of sprint, dev impact is zero (manual path continues) — pure operational risk.
- 5.4 requires push infrastructure (already live) and a shared `safeguarding@` inbox — create in Resend if not already present.
- 5.6 AI DPIA requires clarity on care-note summarisation training data usage — confirm with model provider (Anthropic / OpenAI) before finalising retention section.

---

### Sprint 6: "Payroll & BACS"
**Dates:** Mon 24 Aug → Fri 4 Sep
**Theme:** Two-channel payroll automation live. Weekly Stripe Connect payouts remain stable for Marketplace; monthly BACS18 payroll cycle goes live for Channel B carers, aligned to net-14 org invoice clearing. HMRC RTI compliant.

| # | Item | Source | Effort | Acceptance |
|---|------|--------|--------|------------|
| 6.1 | **Lloyds BACS SUN application submitted + tracking** | `lloyds_bacs_sun_brief` | ~½ day | Application filed with Lloyds Commercial Banking. Case reference captured in `docs/operations/bacs-sun-status.md`. Weekly chase cron templated for follow-up until decision. |
| 6.2 | **BACS18 export format generator** | Phase 4 gap | ~2 days | `payroll.generateBacs18(runId)` produces a compliant BACS18 file (fixed-width layout, correct VOL1/HDR1/UHL1 headers, EOF1/UTL1 trailers) from `payroll_runs`. Golden-file tests against Lloyds sample. Manual upload path via Lloyds Commercial Banking Online documented in `docs/operations/bacs-manual-upload.md` for use pre-SUN. |
| 6.3 | **Monthly payroll run cycle — Channel B carers** | Phase 4 gap | ~2 days | Cron fires on 25th of each month, runs payroll for prior calendar month's Channel B hours. Aggregates timesheets → applies £14/£21/£28 rate matrix (weekday / BH-standard / BH-premium) → generates payslip PDFs → writes `payroll_runs` + `payslips` rows → emits BACS18 file. Uses `payroll_apr26_draft_payslip_priya.pdf` template as reference. |
| 6.4 | **Holiday pot accrual & draw-down** | Phase 4 gap | ~1 day | 12.07% holiday accrual auto-added to each Channel B carer's holiday pot per hour worked (rate to be confirmed with employment counsel before first live run — see risks). Draw-down flow in carer app: request → RM approval → payout in next payroll cycle. Balance visible on carer earnings dashboard. |
| 6.5 | **Payslip PDF template + carer portal delivery** | Phase 4 gap | ~1 day | Payslip PDF compliant with s.8 Employment Rights Act 1996: gross pay, deductions itemised (PAYE, NI, pension, student loan if applicable), net pay, pay period, employer name/address, tax code, YTD figures. Delivered via email + in-app `/m/payslips` view. HMRC-compliant format. |
| 6.6 | **HMRC RTI submission via BrightPay API** | Statutory | ~1 day | Full Payment Submission + Employer Payment Summary filed with HMRC per pay cycle. BrightPay chosen as primary (HMRC-recognised, documented API, standalone UK). Filed within 3 working days of pay date. Manual fallback via HMRC Basic PAYE Tools documented in `docs/operations/rti-manual-filing.md`. |
| 6.7 | **Stripe Connect Marketplace payout monitoring + carer "when am I paid?" dashboard** | Operational | ~1 day | Weekly admin digest: Marketplace payouts sent, failed, disputed. Failed-payout alert within 2h via push + email + `safeguarding@` mirror. New carer-facing `/m/earnings/schedule` view: next payout date, amount pending, historical payouts, holiday pot balance (from 6.4). |

**Demo at end of sprint (staging, 25 Aug run):** Test carer Priya has 82 hours in July 2026, mix of weekday and August summer BH hours. Monthly payroll cron fires → produces payslip PDF showing £14/£21 rate rows, gross £1,254.40, itemised PAYE + NI + pension deductions, holiday accrual £151.31 (12.07% × £1,254.40), net pay figure. BACS18 file generated, validated against Lloyds sample layout. Priya receives payslip email + in-app notification and can see the next payout date on her earnings dashboard. Admin dashboard shows the run as "Ready to submit" pending Lloyds SUN approval. RTI FPS filed via BrightPay sandbox.

**Total committed effort:** ~8.5 dev-days across 10 working days.

**Dependencies / risks:**
- **6.1** — Lloyds SUN approval timeline unknown (~4-6 weeks typical). If not approved by sprint end, upload BACS18 files manually via Lloyds Commercial Banking Online (supported natively). No dev block.
- **6.4 (statutory risk)** — 12.07% holiday accrual assumes standard 5.6-weeks statutory entitlement for zero-hours workers. Must be confirmed in writing with employment counsel before the first live payroll run. Getting holiday accrual wrong is a tribunal risk. Cheap paper check, non-negotiable.
- **6.6** — HMRC RTI is legally required within pay date + 3 working days; non-negotiable. Must ship even if BrightPay integration slips — manual fallback via HMRC Basic PAYE Tools is documented.
- **US W-2 payroll (Gusto Embedded)** — explicitly OUT OF SCOPE for Sprint 6. Deferred to Sprint 7+ when US expansion becomes concrete. Workspace brief `gusto_embedded_brief` remains available.

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
