> ⚠️ SUBJECT TO LEGAL REVIEW BEFORE FIRST COUNTERPARTY SIGNATURE. Drafted from market-standard templates by All Care 4 U Group Ltd. Last updated: 2026-05-09.

# Data Processing Addendum (DPA)

**Version:** dpa-v1.0-2026-05
**Between:** All Care 4 U Group Ltd t/a **SpecialCarer** ("**Processor**")
**And:** the Customer ("**Controller**")

This DPA is **Schedule 1** to the Master Services Agreement (MSA) and forms part of it. It governs the Processor's processing of personal data on behalf of the Controller under UK GDPR, the Data Protection Act 2018, the EU GDPR (where applicable), and US state privacy laws (including HIPAA where applicable).

---

## 1. Roles

1.1 The **Customer is the Controller**: it determines the purposes and means of processing personal data of its Service Users.
1.2 **SpecialCarer is the Processor**: it processes personal data on the Controller's documented instructions to deliver the Services under the MSA.
1.3 SpecialCarer remains an independent Controller for **its own** users (Carers, family seekers, admins) and for safety-critical platform-side data.

## 2. Subject matter, duration, nature, purpose

| Item | Detail |
|---|---|
| Subject matter | Care booking, scheduling, communication, billing |
| Duration | The term of the MSA + 30 days (return / deletion period) |
| Nature | Storage, access, transmission, processing |
| Purpose | Delivering care to the Controller's Service Users |

## 3. Categories of data subjects and personal data

3.1 **Categories of data subjects:** Service Users, Controller's staff, Controller's contacts, third-party household members where relevant.
3.2 **Categories of personal data (ordinary):** name, contact details, addresses, scheduling preferences, free-text notes.
3.3 **Special category data:** **health data** (care needs, mobility, conditions, medications). The Controller acknowledges that health data is processed on its instructions for the purpose of arranging care, with safeguards in place.

## 4. Sub-processors

4.1 SpecialCarer uses the following sub-processors:

| Sub-processor | Purpose | Region |
|---|---|---|
| Supabase | Primary database, authentication, storage | EU / UK regions |
| Stripe | Payment processing, invoicing, payouts | Multi-region |
| Resend | Transactional email | EU / US |
| IONOS | Domain SMTP for branded transactional email | EU / UK |
| Mapbox | Geocoding, maps, distance calculations | US (anonymised query) |
| Vercel | Application hosting | EU / global edge |

4.2 SpecialCarer will notify the Controller of any new sub-processor in advance with **14 days' notice** to object. If the Controller reasonably objects, the parties will work in good faith to resolve; if not resolvable, the Controller may terminate the affected Services.

## 5. International transfers

5.1 Personal data is hosted in **EU / UK regions** by Supabase. Where any sub-processor processes personal data outside the EEA / UK, transfers are made under appropriate safeguards: the **UK International Data Transfer Agreement** (IDTA) and / or **EU Standard Contractual Clauses** (SCCs), incorporated by reference.
5.2 Mapbox queries are anonymised at the platform layer (only postcode / coordinates are sent, never names).

## 6. Security (Annex II)

6.1 SpecialCarer implements appropriate technical and organisational measures, including:
  (a) **TLS 1.2+** for data in transit;
  (b) **AES-256 at rest** for database storage;
  (c) **Row-Level Security (RLS)** at the database layer enforcing user-scoped access;
  (d) **MFA** for SpecialCarer admin accounts;
  (e) audit logs retained for at least 12 months;
  (f) encrypted automated backups, restorable to a known-good state;
  (g) least-privilege access on a need-to-know basis;
  (h) regular vulnerability scanning, with a target of an independent penetration test once per year.

## 7. Personal data breach notification

7.1 SpecialCarer will notify the Controller without undue delay and **within 72 hours** of becoming aware of a personal data breach affecting the Controller's data.
7.2 The notification will include, to the extent known:
  (a) nature of the breach, categories and approximate number of data subjects and records;
  (b) likely consequences;
  (c) measures taken or proposed.

## 8. Data subject rights

8.1 SpecialCarer will assist the Controller in responding to data-subject requests (DSARs, rectification, erasure, restriction, portability) within **30 days** of being notified by the Controller, taking into account the nature of the processing.
8.2 Where SpecialCarer receives a DSAR directly, it will forward it to the Controller without responding to the data subject (other than to acknowledge receipt).

## 9. Audits

9.1 The Controller may audit SpecialCarer's compliance with this DPA on **30 days' written notice**, no more than **once per twelve months**, during business hours, in a manner that does not unreasonably disrupt operations.
9.2 The audit is at the Controller's expense unless a material breach is found, in which case SpecialCarer pays reasonable audit costs.
9.3 SpecialCarer may satisfy audits through up-to-date third-party certifications (e.g. SOC 2, ISO 27001) where reasonable.

## 10. Term

10.1 This DPA is effective for the duration of the MSA, plus the return / deletion period.

## 11. Return / deletion of data

11.1 On termination of the MSA, SpecialCarer will at the Controller's option **return** or **delete** the Controller's personal data within **30 days** and provide a written confirmation of deletion ("**deletion certificate**").
11.2 SpecialCarer may retain copies as required by law (e.g. tax records) and on encrypted backups for the duration of the backup-retention cycle, after which they are securely overwritten.

## 12. Confidentiality

12.1 SpecialCarer ensures that everyone authorised to process the Controller's personal data is bound by confidentiality obligations (employees and sub-processors).

## 13. Liability

13.1 Liability under this DPA is governed by the MSA, including the carve-out at MSA section 8.2(e) for breach of data-protection law.

---

*By signing below, the Controller's signatory confirms they are authorised to bind the Controller to this DPA.*

**Signed for the Controller**

Name: _____________________________
Role: _____________________________
Date: _____________________________

**Countersigned for All Care 4 U Group Ltd t/a SpecialCarer**

Name: _____________________________
Date: _____________________________
