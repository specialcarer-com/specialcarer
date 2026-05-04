import type { Metadata } from "next";
import ServicePage from "@/components/service-page";

export const metadata: Metadata = {
  title: "Live-in care — SpecialCarer",
  description:
    "Live-in caregivers across the UK and US. A vetted, background-checked caregiver moves in for a placement of several days at a time. Paid as a weekly rate.",
};

export default function Page() {
  return (
    <ServicePage
      eyebrow="Live-in care"
      title="A trusted carer who lives with you."
      lede="Continuity, companionship, and safety without the upheaval of moving into residential care. A live-in caregiver moves into your home for a placement, typically a week or two at a time, providing daytime support and overnight peace of mind. Live-in placements are billed as a weekly rate, not by the hour."
      bullets={[
        "Round-the-clock support, 7+ days at a time",
        "One-to-one attention from a single caregiver",
        "Personal care, mobility, and medication reminders",
        "Meal preparation, light housekeeping, errands",
        "Companionship and routine maintenance",
        "Sleeping nights or waking nights, declared upfront",
        "Suitable for elderly, post-operative, and special-needs care",
        "Couples can share a single live-in caregiver",
        "Ongoing rotation: paired caregivers swap every week or two",
        "Caregivers receive their own private room and daily breaks",
      ]}
      certifications={[
        "Enhanced DBS (UK)",
        "Checkr criminal-record (US)",
        "Right-to-work / I-9 verified",
        "Manual handling training",
        "Medication awareness",
        "First aid certified",
        "Safeguarding Level 1+",
      ]}
      faqs={[
        {
          q: "How are live-in carers paid?",
          a: "Live-in placements are billed as a weekly rate set by the caregiver, not by the hour. Indicative ranges are £700–£900/week in the UK and $1,000–$1,400/week in the US, depending on complexity of care and whether nights are sleeping or waking. SpecialCarer's 20% service fee is added on top.",
        },
        {
          q: "How long does a live-in caregiver stay?",
          a: "Typically a 7- to 14-day rotation, with a paired caregiver taking over so the first can rest. We help arrange paired caregivers for ongoing live-in care, or single placements for a one-off block (e.g. while a family carer takes a holiday).",
        },
        {
          q: "What does the caregiver need from us?",
          a: "Their own private bedroom (a sofa-bed isn't enough for sustained live-in work), reasonable food, and 2 hours of break each day. UK regulations require an 8-hour uninterrupted overnight rest unless you specifically book a 'waking nights' caregiver.",
        },
        {
          q: "Can a live-in caregiver give medication?",
          a: "Caregivers can prompt and remind, and administer pre-prepared medication (e.g. dosette boxes) where they have the appropriate training. They do not perform clinical procedures, injections, or controlled-drug administration unless they are a registered nurse engaged for that purpose.",
        },
        {
          q: "What if it isn't working out?",
          a: "You can request a swap to a different caregiver at any time, with 48 hours' notice. We'll help arrange a replacement and pro-rate the weekly rate.",
        },
        {
          q: "Can the same person also do visiting work?",
          a: "Yes — many caregivers offer both. On their profile they'll show a weekly rate for live-in placements and an hourly rate for visits. You can book whichever format suits you.",
        },
      ]}
    />
  );
}
