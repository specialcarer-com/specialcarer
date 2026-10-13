# DSAR data map

What the subject access export does with every table in the public schema. The decision itself lives in
`src/lib/dsar/data-map.ts` and is enforced by `src/lib/dsar/data-map.test.ts`; this page is the readable
copy for the data protection lead and the Nominated Individual.

Exporter version: `dsar-export/1.3.0`. Tables: 168.
Exported: 94. Deferred (needs a decision): 35.
Excluded with a reason: 17. Not personal data: 22.

## How to keep it true

Adding a table to a migration without adding it to `data-map.ts` fails the test suite. Pick one:
`exported` (and add it to `DSAR_TABLES`, `CHILD_TABLES` or `EMAIL_KEYED_TABLES` in `export.ts`),
`deferred`, `excluded`, or `not_personal`. Every choice except `exported` needs a reason.

## Exported in part

- `blocked_caregivers`: Only blocks the subject placed. Who has blocked the subject is the other person's data.
- `review_private_feedback`: Only feedback the subject wrote. Private feedback about the subject is withheld pending a decision.
- `safety_reports`: Only reports the subject filed. Reports about the subject involve another person and possible safeguarding exemptions.
- `seeker_ratings`: Only ratings the subject wrote as a carer. Ratings about the subject as a seeker are withheld pending a decision.
- `shift_timesheets`: Carer side only. The approving seeker's details are removed. A seeker-side projection is still to be designed.

## Deferred: needs a decision before release

| Table | Why |
| --- | --- |
| `admin_audit_log` | Staff personal data mixed in; needs a redaction pass before release. |
| `ai_anomaly_signals` | Profiling output about a person (UK GDPR Art. 15(1)(h)). Table is empty and its jobs do not run; add to the export before those jobs are switched on. |
| `ai_care_summaries` | Summaries derived from care notes about a care recipient. Empty today; decide whose data it is before release. |
| `ai_chat_messages` | Reached through ai_chat_sessions, which also holds anonymous sessions. Empty today. |
| `ai_chat_sessions` | Subject's own chats with the assistant, but anonymous sessions cannot be matched to a person. Empty today. |
| `ai_match_features` | Profiling output about a person (UK GDPR Art. 15(1)(h)). Table is empty and its jobs do not run; add to the export before those jobs are switched on. |
| `ai_match_scores` | Profiling output about a person (UK GDPR Art. 15(1)(h)). Table is empty and its jobs do not run; add to the export before those jobs are switched on. |
| `ai_schedule_predictions` | Profiling output about a person (UK GDPR Art. 15(1)(h)). Table is empty and its jobs do not run; add to the export before those jobs are switched on. |
| `booking_tasks` | Task labels can describe a recipient's care needs. Needs a role-aware view for the two booking parties. |
| `care_journal_entries` | Notes written by a carer about a care recipient; contains the recipient's health information. |
| `care_note_summaries` | Derived from care notes; decide with care_journal_entries. |
| `carer_referrals` | Contains the referred person's email and payout detail; needs a role-aware view. |
| `chat_attachments` | Shared conversations involve another person. Release needs that person's consent or a redaction rule (existing decision). |
| `chat_family_invites` | Shared conversations involve another person. Release needs that person's consent or a redaction rule (existing decision). |
| `chat_message_flags` | Shared conversations involve another person. Release needs that person's consent or a redaction rule (existing decision). |
| `chat_message_translations` | Shared conversations involve another person. Release needs that person's consent or a redaction rule (existing decision). |
| `chat_messages` | Shared conversations involve another person. Release needs that person's consent or a redaction rule (existing decision). |
| `chat_participants` | Shared conversations involve another person. Release needs that person's consent or a redaction rule (existing decision). |
| `chat_threads` | Shared conversations involve another person. Release needs that person's consent or a redaction rule (existing decision). |
| `dsar_deferred_erasure_queue` | Internal retention queue; decide with dsar_erasure_audit. |
| `dsar_erasure_audit` | Record of erasures kept for accountability; decide whether the subject receives it. |
| `family_invites` | Holds the invited person's email and details; needs a role-aware view. |
| `fraud_signals` | Risk scoring about a person; fraud-prevention exemption may apply. Needs legal view. |
| `messages` | Shared conversations involve another person. Release needs that person's consent or a redaction rule (existing decision). |
| `notifiable_event_actions` | Part of the duty of candour case file; decide with notifiable_events. |
| `notifiable_events` | Duty of candour casework; subject may be a care recipient rather than an account holder. |
| `org_booking_cancellations` | Organisation booking record naming who cancelled; decide with the other organisation tables. |
| `referral_claims` | Names the other party in a referral; needs a role-aware view. |
| `referrals` | Names the other party in a referral; needs a role-aware view. |
| `safeguarding_alerts` | Safeguarding records involve third parties and possible exemptions. Needs legal view. |
| `service_users` | People receiving care through an organisation. They are not account holders, so a request from them cannot be matched by user id, and the organisation may be the controller. |
| `stripe_dispute_cases` | Dispute case file with internal notes; decide what the subject may see. |
| `timeline_comments` | Family timeline content is shared between several people; needs a redaction rule. |
| `timeline_events` | Family timeline content is shared between several people; needs a redaction rule. |
| `timeline_reactions` | Family timeline content is shared between several people; needs a redaction rule. |

## Excluded on purpose

| Table | Why |
| --- | --- |
| `caregiver_commute_cache` | Regenerable travel-time cache; not a record about the person. |
| `checkr_webhook_events` | Vendor event log; a copy of data held in the exported tables. |
| `cms_posts` | Public content written by staff in their work capacity. |
| `interview_rooms` | Staff-created video room links (credentials); interview details come from interviews. |
| `match_experiment_assignments` | Booking-level A/B arm assignment; the arm is also stored on booking_match_offers, which is exported. |
| `mfa_recovery_codes` | Credentials (hashed recovery codes); never exported. |
| `org_invoices` | Business billing record of the organisation. |
| `org_receipts` | Business billing record of the organisation. |
| `organization_billing` | Business record of the organisation, not of an individual. |
| `organization_contracts` | Business contract; signatory name is part of the contract record. Revisit with legal. |
| `organization_documents` | Business documents uploaded by the organisation. |
| `organizations` | Business record of the organisation; the person's own membership comes from organization_members. |
| `refund_reconciliation` | Internal reconciliation derived from refund_ledger, which is exported. |
| `spam_lead_attempts` | Rejected spam submissions; cannot be reliably tied to a person. |
| `stripe_webhook_events` | Vendor event log; a copy of data held in the exported tables. |
| `uchecks_webhook_events` | Vendor event log; a copy of data held in the exported tables. |
| `vendor_costs` | Internal cost accounting for vendor checks. |

## Known limits of the export

- **Staff notes are withheld** from every exported table (`admin_notes`, onboarding notes, review notes and similar).
  This follows the earlier exporter design. A subject may be entitled to some of it, so it needs a legal view.
- **One request returns at most 1,000 rows.** The exporter does not page. A table that reaches that size is marked
  `possibly_incomplete_row_limit` in the file and named in its notes. Paging should be added before any account
  holds that many rows (location pings and notifications are the likely first).
- **Uploaded files are not bundled.** Photos, documents and videos appear as stored paths only.
- **Email-keyed tables** (waiting list, carer prospects, opt-outs, enquiries, invitations) are matched on the
  verified request email, in its original and lower-case form.
- **Seeker-side timesheets** are not yet exported; the carer-side projection is.
