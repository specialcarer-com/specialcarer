import type { Metadata } from "next";
import ServicePage from "@/components/service-page";

export const metadata: Metadata = {
  title: "Visiting care — SpecialCarer",
  description:
    "Scheduled visiting care across the UK and US — daily, weekly, or one-off visits with vetted, background-checked caregivers. From £18/hour (UK), $25/hour (US).",
};

export default function Page() {
  return (
    <ServicePage
      bannerKey="care_formats.visiting"
      eyebrow="Visiting care"
      title="Help that fits around your life."
      lede="A caregiver who arrives at an agreed time, supports with everyday routines, and leaves you to it. Visiting care is the most flexible format — from a single hour a week to several visits a day, on demand or on a regular schedule. Visits are billed by the hour."
      bullets={[
        "From a single hour up to multiple visits a day",
        "Personal care: washing, dressing, toileting",
        "Medication prompts and reminders",
        "Meal preparation and feeding support",
        "Companionship calls — a friendly chat and a cuppa",
        "School pickups and after-school childcare",
        "Help getting out — appointments, shopping, walks",
        "Light housekeeping and laundry",
        "Waking-night visits — carer stays awake throughout the overnight block (billed hourly)",
        "Same caregiver for recurring visits where possible",
        "Real-time check-in and check-out so families know they've arrived",
      ]}
      certifications={[
        "Enhanced DBS (UK)",
        "Checkr criminal-record (US)",
        "Right-to-work / I-9 verified",
        "Manual handling training",
        "First aid certified",
        "Safeguarding Level 1+",
        "Driver licence (where transport is needed)",
      ]}
      faqs={[
        {
          q: "How are visiting carers paid?",
          a: "Visits are billed by the hour at the rate set by the caregiver — typically from £18/hour in the UK and $25/hour in the US. SpecialCarer's 30% service fee is added on top. Final price is shown clearly before you confirm a booking.",
        },
        {
          q: "What's the minimum visit length?",
          a: "One hour for recurring weekly visits with a caregiver you've used before. Three hours for a first booking with a new caregiver, so they have time to learn the routines properly.",
        },
        {
          q: "Can I book multiple visits in a single day?",
          a: "Yes — many families book a morning visit (wash, breakfast, medication), a lunch visit, and a teatime visit. You can build a recurring weekly schedule with as many slots as you need, and caregivers bid for the schedule that fits them.",
        },
        {
          q: "Will it be the same caregiver every visit?",
          a: "We try hard to keep continuity, especially for elderly clients where consistency matters. For recurring schedules you'll typically have a primary caregiver and one or two backup caregivers who cover holidays and sickness.",
        },
        {
          q: "How do I know the caregiver actually turned up?",
          a: "Every shift has a real-time check-in and check-out logged in the app. You and any nominated family member get a notification when the caregiver arrives and when they leave. Each visit is timestamped and visible in your dashboard.",
        },
        {
          q: "Do you offer waking-night visits?",
          a: "Yes. A waking-night visit is an overnight block — typically 9pm–7am or similar — where the caregiver stays awake throughout to support clients who need active care at night (for example dementia wandering risk, post-operative recovery, seizure monitoring, or complex care). Waking-night visits are billed by the hour like any other visit, often at a slightly higher overnight rate the caregiver sets on their profile. This is different from live-in waking nights, which are included in the live-in weekly rate.",
        },
        {
          q: "What's the difference between a waking-night visit and a sleeping night?",
          a: "On a waking night the carer is up and active throughout the block — billed hourly. A sleeping night is only available as part of a live-in placement: the carer sleeps in your home and is paid a flat night allowance, with up to two short wake-ups included. If you need someone awake every night without a full live-in arrangement, book waking-night visits instead.",
        },
        {
          q: "Can the same person also do live-in work?",
          a: "Yes — many caregivers offer both. On their profile you'll see a weekly rate for live-in placements alongside their hourly visiting rate.",
        },
      ]}
    />
  );
}
