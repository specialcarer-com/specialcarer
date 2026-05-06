import type { Metadata } from "next";
import ServicePage from "@/components/service-page";

export const metadata: Metadata = {
  title: "Complex care — SpecialCarer",
  description:
    "Clinically trained caregivers for complex needs — PEG/tracheostomy care, ventilator support, seizure management, palliative and end-of-life care. UK and US, fully vetted and matched to your medical brief.",
};

export default function Page() {
  return (
    <ServicePage
      eyebrow="Complex care"
      title="Clinical-grade care, in the comfort of home."
      lede="When a loved one needs more than companionship — tube feeds, tracheostomy management, ventilator support, seizure protocols, or palliative care — you need caregivers with the clinical training and steady hands to match. SpecialCarer connects you with vetted nurses, healthcare assistants, and complex-care specialists who can step in for a shift, a respite week, or an ongoing care plan."
      bullets={[
        "PEG, NG, and JEJ tube-feed competence",
        "Tracheostomy suctioning and care",
        "Ventilator and CPAP/BiPAP support",
        "Seizure recognition and rescue medication (buccal midazolam) — where prescribed",
        "Stoma and catheter care",
        "Pressure-area management and complex moving & handling",
        "Diabetes management, including insulin administration (clinical grade only)",
        "Spinal cord injury and acquired brain injury support",
        "End-of-life and palliative care, in partnership with hospice teams",
        "Continuing Healthcare (CHC) package support — UK",
      ]}
      certifications={[
        "Registered Nurse (NMC, UK) or RN/LPN (US) — verified",
        "Healthcare Assistant with clinical competencies (UK) / CNA (US)",
        "Enhanced DBS with Children's & Adults' Barred List (UK)",
        "Checkr enhanced healthcare-sanctions screening (US)",
        "Tracheostomy care competency",
        "Tube-feed competency (PEG/NG/JEJ)",
        "Basic life support (BLS) within last 12 months",
        "Manual handling & moving and handling of people",
        "Medication administration (administer, not just prompt)",
      ]}
      faqs={[
        {
          q: "How is complex care different from elderly or special-needs support?",
          a: "Complex care involves clinical tasks delegated by a registered professional — administering medication, managing a tracheostomy, operating a ventilator, or following seizure protocols. Caregivers in this category must hold the relevant clinical registration or certified competencies, not just general care experience. We verify those credentials at sign-up and re-verify annually.",
        },
        {
          q: "Can a caregiver follow my loved one's existing care plan?",
          a: "Yes — that's the expectation. Before a complex-care booking starts, share the written care plan (PEG-feed schedule, ventilator settings, seizure rescue protocol, etc.) with the caregiver via the in-app document upload. The caregiver reviews and confirms competency before accepting. Tasks not covered by their training will be declined and clearly flagged.",
        },
        {
          q: "Do you support end-of-life and palliative care at home?",
          a: "Yes. Many families want a familiar, calm presence at home in the final weeks. Our palliative-trained caregivers work alongside the hospice or community palliative team — they don't replace clinical care, but they provide the round-the-clock continuity that lets families rest and be present. Tell us at booking that the support is palliative so we can match accordingly.",
        },
        {
          q: "Is complex care priced the same as standard care?",
          a: "Caregivers set their own rate. Most clinical-grade caregivers charge above the standard hourly rate to reflect their training and the responsibility involved. Rates are shown on each profile before you book — no surprises.",
        },
        {
          q: "What about Continuing Healthcare (UK) or long-term care insurance (US)?",
          a: "We can't yet bill NHS Continuing Healthcare directly, and US long-term care insurance reimbursement varies by carrier. Many families pay privately and submit receipts to their insurer or CHC personal-budget administrator — every booking generates a clean receipt. We're working on direct funder integration; get in touch if you'd like updates.",
        },
        {
          q: "What if a clinical incident happens during a shift?",
          a: "Caregivers log incidents in real time through the app's care journal. Serious clinical incidents trigger an immediate alert to our trust-and-safety team, and the in-app SOS button gives the caregiver one-tap access to emergency support. We also encourage families to keep their primary clinical contact (community nurse, hospice line, or GP) reachable during shifts.",
        },
      ]}
    />
  );
}
