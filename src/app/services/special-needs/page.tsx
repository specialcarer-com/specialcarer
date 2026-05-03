import type { Metadata } from "next";
import ServicePage from "@/components/service-page";

export const metadata: Metadata = {
  title: "Special-needs care — SpecialCarer",
  description:
    "Caregivers experienced with autism, ADHD, sensory processing, learning disabilities, and complex care needs. Vetted, trained, and matched to your child or adult.",
};

export default function Page() {
  return (
    <ServicePage
      eyebrow="Special-needs care"
      title="Care that meets your family where you are."
      lede="Finding a caregiver who actually understands your child or adult's specific needs is hard. We make it easier by letting you filter for declared experience with autism, ADHD, sensory processing differences, learning disabilities, and physical disabilities — and by verifying training credentials."
      bullets={[
        "Autism-informed support (PECS, visual schedules, sensory accommodations)",
        "ADHD support and behavioural co-regulation",
        "Sensory processing-aware care",
        "Learning disability support",
        "Down syndrome experience",
        "Cerebral palsy and physical disability support",
        "PEG feed and tube-feed competence (clinical caregivers only)",
        "AAC device familiarity",
        "Respite care for family carers",
        "School holiday and PA-style support",
      ]}
      certifications={[
        "Enhanced DBS with Children's & Adults' Barred List (UK)",
        "Checkr enhanced screening (US)",
        "PECS Level 1",
        "Team Teach / MAPA (positive behaviour support)",
        "Makaton",
        "Autism awareness training",
        "Epilepsy awareness",
        "Manual handling",
      ]}
      faqs={[
        {
          q: "How do you verify special-needs experience?",
          a: "At sign-up, caregivers self-declare experience and upload any training certificates. Certificates are reviewed by our team. We do not currently offer in-house clinical assessment of caregivers, so we strongly recommend a paid trial shift before committing to a recurring schedule. We're transparent about this — you can always ask to see a caregiver's certificates.",
        },
        {
          q: "Can a caregiver attend medical appointments with us?",
          a: "Yes. Many families book a caregiver to support a child or adult during an appointment, particularly when sensory load or anxiety makes the appointment difficult. Tell us this is the booking purpose so we can match accordingly.",
        },
        {
          q: "Do you support adults with learning disabilities?",
          a: "Yes. SpecialCarer is open to adult care as well as childcare. For local-authority commissioned support (UK) or Medicaid waiver-funded care (US), the marketplace can't yet bill those funders directly, but we're working on it — get in touch if you'd like updates.",
        },
        {
          q: "Can I request the same caregiver every week?",
          a: "Absolutely. After a successful first booking you can favourite a caregiver and book recurring slots. Predictability and continuity are particularly important for many neurodivergent families.",
        },
        {
          q: "What if my child has a meltdown or behaviour-of-concern episode?",
          a: "All caregivers tagged for special-needs work commit to a positive-behaviour-support approach. Caregivers are trained never to use physical restraint unless certified (Team Teach / MAPA), and even then only as a last resort to prevent imminent harm. Incidents are logged through the app and our safeguarding team is alerted to serious events.",
        },
      ]}
    />
  );
}
