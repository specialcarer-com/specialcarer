/**
 * CQC notification templates for duty-of-candour + notifiable-event
 * casework (Phase C — PR C3b).
 *
 * Scope: CQC-only. Special Carer / All Care 4 U Group Ltd operates in
 * England only under CQC registration (see Statement of Purpose). The
 * three UK devolved-nation regulators (CIW — Wales; RQIA — Northern
 * Ireland; Care Inspectorate — Scotland) are represented only as
 * greyed-out placeholder stubs in the UI, each carrying an explicit
 * "not currently applicable" note. They are declared here so that when
 * Special Carer's operational scope extends, the surface area for
 * wiring real templates is already discovered.
 *
 * The templates are DELIBERATELY not integrated with any auto-submit
 * pipeline. CQC's notification form is completed manually by the RM
 * (Registered Manager) on the CQC portal; these templates provide the
 * exact wording the RM copies into the free-text sections. Every
 * template body carries:
 *
 *   • The statutory reference (Reg 16 for death, Reg 18 for other
 *     notifiable incidents) — CQC (Registration) Regulations 2009.
 *   • A "without delay" affirmation — the "This notification is being
 *     made without delay upon becoming aware of the incident on
 *     [DISCOVERED_AT]." sentence — recommended by CQC as evidence of
 *     compliance with the s.20 duty of candour timeliness expectation.
 *   • Bracketed [PLACEHOLDER] tokens for the RM to substitute; the
 *     admin UI shows the template verbatim so the RM can see exactly
 *     what will be sent.
 *   • Provider footer — legal entity, CQC location ref, RM signature.
 *
 * If any of the token names below change, update the test file at
 * `regulator-templates.test.ts` — it asserts the presence of every
 * token so drift is caught by CI.
 */

import type { NotifiableType } from "./case";

export type RegulatorTemplate = {
  title: string;
  body: string;
  /** Short pull-quote from the statutory regulation used for the UI title. */
  statutoryClause: string;
};

const COMMON_OPENING = (regNum: 16 | 18) =>
  `Notification to the Care Quality Commission under Regulation ${regNum} of the Care Quality Commission (Registration) Regulations 2009.\n\nProvider: Special Carer (All Care 4 U Group Ltd)\nCQC Location Reference: [CQC_LOCATION_REF]\nRegistered Manager: [RM_NAME_CONTACT]\n\nService user: [SERVICE_USER_NAME]\nDate and time of incident: [DATE_TIME]\nLocation: [LOCATION]\n\nNature of incident:\n[NATURE_OF_INCIDENT]\n\nImmediate actions taken:\n[IMMEDIATE_ACTIONS_TAKEN]\n\nClinical / third-party involvement:\n[CLINICAL_INVOLVEMENT]`;

const COMMON_CLOSING =
  `\n\nThis notification is being made without delay upon becoming aware of the incident on [DISCOVERED_AT].\n\nSigned:\n[RM_NAME_CONTACT]\nRegistered Manager, Special Carer (All Care 4 U Group Ltd)\n\nContact: [RM_NAME_CONTACT]\nSubmitted via the CQC Provider Portal.`;

const REG_16_CLAUSE =
  "Reg 16 — Notification of the death of a service user.";
const REG_18_CLAUSE =
  "Reg 18 — Notification of other incidents that adversely affect the safety, welfare or wellbeing of service users.";

export const CQC_TEMPLATES: Record<NotifiableType, RegulatorTemplate> = {
  death: {
    title: "CQC Regulation 16 — Death of a service user",
    statutoryClause: REG_16_CLAUSE,
    body:
      COMMON_OPENING(16) +
      `\n\nUnder Regulation 16 of the CQC (Registration) Regulations 2009, we are notifying the Commission of the death of a service user whilst services were being provided in the carrying on of the regulated activity, or which may be attributable to services being provided in the carrying on of the regulated activity.` +
      `\n\nCause of death (as understood at time of notification):\n[NATURE_OF_INCIDENT]` +
      `\n\nNext of kin informed: yes / no (delete as appropriate)\nCoroner referral: yes / no (delete as appropriate)` +
      COMMON_CLOSING,
  },
  injury_serious: {
    title: "CQC Regulation 18 — Serious injury to a service user",
    statutoryClause: REG_18_CLAUSE,
    body:
      COMMON_OPENING(18) +
      `\n\nUnder Regulation 18(2)(a) of the CQC (Registration) Regulations 2009, we are notifying the Commission of a serious injury sustained by a service user whilst services were being provided in the carrying on of the regulated activity.` +
      `\n\nNature and severity of injury:\n[NATURE_OF_INCIDENT]` +
      `\n\nHospitalisation required: yes / no (delete as appropriate)\nExpected recovery / prognosis: [NATURE_OF_INCIDENT]` +
      COMMON_CLOSING,
  },
  abuse_alleged: {
    title: "CQC Regulation 18 — Allegation of abuse",
    statutoryClause: REG_18_CLAUSE,
    body:
      COMMON_OPENING(18) +
      `\n\nUnder Regulation 18(2)(e) of the CQC (Registration) Regulations 2009, we are notifying the Commission of an allegation of abuse in relation to a service user.` +
      `\n\nType of abuse alleged: [NATURE_OF_INCIDENT]\nAlleged perpetrator (role only, redact identity if under investigation): [NATURE_OF_INCIDENT]` +
      `\n\nSafeguarding referral raised with Local Authority: yes / no (delete as appropriate)\nPolice notification: yes / no (delete as appropriate)` +
      COMMON_CLOSING,
  },
  deprivation_of_liberty: {
    title: "CQC Regulation 18 — Application to deprive a person of liberty",
    statutoryClause: REG_18_CLAUSE,
    body:
      COMMON_OPENING(18) +
      `\n\nUnder Regulation 18(4A) of the CQC (Registration) Regulations 2009, we are notifying the Commission of an application, or the outcome of an application, made to a Court in relation to the deprivation of liberty of a service user.` +
      `\n\nApplication reference / outcome: [NATURE_OF_INCIDENT]\nAuthorising body (Court of Protection / Supervisory Body): [NATURE_OF_INCIDENT]` +
      COMMON_CLOSING,
  },
  incident_police_involved: {
    title:
      "CQC Regulation 18 — Incident reported to or investigated by the police",
    statutoryClause: REG_18_CLAUSE,
    body:
      COMMON_OPENING(18) +
      `\n\nUnder Regulation 18(2)(d) of the CQC (Registration) Regulations 2009, we are notifying the Commission of an incident that is reported to or investigated by the police in relation to a service user.` +
      `\n\nPolice force and reference number: [NATURE_OF_INCIDENT]\nStatus of investigation: [NATURE_OF_INCIDENT]` +
      COMMON_CLOSING,
  },
  service_stopped: {
    title:
      "CQC Regulation 18 — Event stopping or affecting the running of the regulated activity",
    statutoryClause: REG_18_CLAUSE,
    body:
      COMMON_OPENING(18) +
      `\n\nUnder Regulation 18(4)(a)(i) of the CQC (Registration) Regulations 2009, we are notifying the Commission of an event that has stopped, or is likely to stop, the registered person from carrying on the regulated activity safely and properly for a period of 24 hours or more.` +
      `\n\nNature of the disruption and expected duration:\n[NATURE_OF_INCIDENT]` +
      `\n\nContingency plan in place: [IMMEDIATE_ACTIONS_TAKEN]` +
      COMMON_CLOSING,
  },
  other: {
    title: "CQC Regulation 18 — Other notifiable event",
    statutoryClause: REG_18_CLAUSE,
    body:
      COMMON_OPENING(18) +
      `\n\nUnder Regulation 18 of the CQC (Registration) Regulations 2009, we are notifying the Commission of an incident which the Registered Manager has assessed as potentially notifiable pending clarification from the Commission.` +
      `\n\nSummary of the event and reason for triage under Reg 18:\n[NATURE_OF_INCIDENT]` +
      COMMON_CLOSING,
  },
};

// ── Placeholder regulators (devolved nations) ──

export type PlaceholderRegulatorKey = "CIW" | "RQIA" | "Care_Inspectorate";

export type PlaceholderRegulator = {
  name: string;
  jurisdiction: string;
  note: string;
};

const NOT_APPLICABLE_NOTE =
  "Not currently applicable — Special Carer operates in England only under CQC registration. Update when scope expands.";

export const PLACEHOLDER_REGULATORS: Record<
  PlaceholderRegulatorKey,
  PlaceholderRegulator
> = {
  CIW: {
    name: "Care Inspectorate Wales (CIW)",
    jurisdiction: "Wales",
    note: NOT_APPLICABLE_NOTE,
  },
  RQIA: {
    name: "Regulation and Quality Improvement Authority (RQIA)",
    jurisdiction: "Northern Ireland",
    note: NOT_APPLICABLE_NOTE,
  },
  Care_Inspectorate: {
    name: "Care Inspectorate",
    jurisdiction: "Scotland",
    note: NOT_APPLICABLE_NOTE,
  },
};

/**
 * The list of `[PLACEHOLDER]` tokens every CQC template body promises.
 * The test file at `regulator-templates.test.ts` iterates this list and
 * asserts each token appears in every body — if a template drops one,
 * CI fails before the RM ever sees a hole in the copy-paste text.
 */
export const REQUIRED_TEMPLATE_TOKENS: readonly string[] = [
  "[SERVICE_USER_NAME]",
  "[DATE_TIME]",
  "[LOCATION]",
  "[NATURE_OF_INCIDENT]",
  "[IMMEDIATE_ACTIONS_TAKEN]",
  "[CLINICAL_INVOLVEMENT]",
  "[RM_NAME_CONTACT]",
  "[DISCOVERED_AT]",
];
