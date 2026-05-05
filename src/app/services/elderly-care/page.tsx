import type { Metadata } from "next";
import ServicePage from "@/components/service-page";

export const metadata: Metadata = {
  title: "Elderly care at home — SpecialCarer",
  description:
    "Vetted elderly carers for companionship, mobility, dementia-friendly support, medication reminders, and respite. Available across the UK and US.",
};

export default function Page() {
  return (
    <ServicePage
      eyebrow="Elderly care"
      title="Compassionate elderly care, at home."
      lede="Whether your loved one needs a few hours of companionship, help with daily routines, or overnight respite for family carers, our background-checked caregivers can be there — often within the same day."
      bullets={[
        "Companionship and conversation",
        "Light personal care (washing, dressing, toileting)",
        "Mobility support and fall-risk awareness",
        "Medication reminders (non-clinical)",
        "Meal preparation and feeding assistance",
        "Light housekeeping and laundry",
        "Doctor appointment escort",
        "Dementia and Alzheimer's-aware support",
        "Overnight sit-in and respite for family carers",
        "Hospital discharge and post-surgery recovery",
      ]}
      certifications={[
        "Enhanced DBS (UK)",
        "Checkr criminal-record (US)",
        "Care Certificate (UK)",
        "CNA / Home Health Aide (US)",
        "Manual handling training",
        "Dementia Friends",
        "First aid certified",
      ]}
      faqs={[
        {
          q: "Can your caregivers administer medication?",
          a: "Caregivers can offer medication reminders and help with self-administration. Administration of prescription medication (including injections, controlled drugs, and PEG feeds) is only performed by carers and nurses on our platform with the relevant clinical credentials — typically RNs or HCAs whose qualifications we have verified. Tell us about specific medication needs at booking and we'll only match you with appropriately credentialed caregivers.",
        },
        {
          q: "Do you offer live-in care?",
          a: "Yes. When booking a carer you can choose between visiting care (hourly visits, billed by the hour) and live-in care (the carer moves into your home for the placement, billed as a weekly rate). Not every carer offers live-in — the booking screen will show you which formats each carer accepts. For complex clinical needs (PEG feeds, injections, controlled drugs, post-operative care) bookings are routed only to carers and nurses on our platform with the relevant clinical credentials — e.g. RNs, HCAs, and care-certified specialists.",
        },
        {
          q: "Are caregivers insured?",
          a: "Caregivers operate as independent contractors and are responsible for their own public liability cover. SpecialCarer maintains marketplace-level insurance to cover gaps. See our Trust & Safety page for the full breakdown.",
        },
        {
          q: "What if a caregiver doesn't show up?",
          a: "If a caregiver hasn't checked in within 15 minutes of the shift start, our support team is automatically notified. We'll work to find a replacement caregiver and you won't be charged for the missed shift.",
        },
        {
          q: "How does shift tracking work?",
          a: "Once a shift starts, both you and the caregiver can see live location through the app for the duration of the booking — and 15 minutes either side. Location data is automatically deleted 30 days after the shift ends.",
        },
      ]}
    />
  );
}
