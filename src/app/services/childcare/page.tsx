import type { Metadata } from "next";
import ServicePage from "@/components/service-page";

export const metadata: Metadata = {
  title: "Childcare & babysitters — SpecialCarer",
  description:
    "Background-checked babysitters, nannies, and after-school caregivers across the UK and US. Book by the hour, evening, or recurring schedule.",
};

export default function Page() {
  return (
    <ServicePage
      eyebrow="Childcare"
      title="Babysitters &amp; nannies, vetted by us."
      lede="From a one-off date night to ongoing after-school care, find caregivers who are DBS- or Checkr-verified, paediatric first-aid trained, and rated by other parents in your area."
      bullets={[
        "Date-night babysitting (3 hours and up)",
        "After-school pickup and homework help",
        "School holiday and inset day cover",
        "Overnight nannies for travelling parents",
        "Mother's helpers and parent's helpers",
        "Tutoring (Maths, English, languages, exam prep)",
        "Sibling care for newborn-plus families",
        "Birthday party and event sitters",
        "Weekend morning lie-in cover",
        "Pre-screened for your specific age range",
      ]}
      certifications={[
        "Enhanced DBS (UK)",
        "Checkr criminal-record (US)",
        "Paediatric first aid (UK)",
        "Infant/Child CPR (US)",
        "Ofsted-registered (UK, where applicable)",
        "Safeguarding Level 1+",
        "Early Years Educator (Level 3)",
      ]}
      faqs={[
        {
          q: "What's the minimum age of children you support?",
          a: "Caregivers can be matched for children from newborn upwards, but we recommend filtering for caregivers who specifically declare newborn or infant experience for children under one. For postnatal-specific needs (breastfeeding support, sleep training, twin support) see our Postnatal service.",
        },
        {
          q: "Are your nannies Ofsted-registered (UK)?",
          a: "Some are, many aren't — Ofsted registration is optional for caregivers working in your home rather than running a setting. If you need an Ofsted-registered caregiver to use Tax-Free Childcare, filter for that specifically when you search.",
        },
        {
          q: "How much do caregivers cost?",
          a: "Caregivers set their own rates, typically £14–£22/hour in the UK and $20–$35/hour in the US. SpecialCarer adds a 20% service fee that covers verification, insurance, support, and payment processing. See our Pricing page for full transparency.",
        },
        {
          q: "Can caregivers drive my children?",
          a: "Yes, if the caregiver has declared a valid licence and you've explicitly opted in to driving for that booking. We require a valid driving licence on file for any booking that includes transport. Always check the caregiver's profile for vehicle details.",
        },
        {
          q: "Is there a minimum booking length?",
          a: "Three hours for ad-hoc bookings. Recurring weekly schedules can be as short as one hour per session.",
        },
      ]}
    />
  );
}
