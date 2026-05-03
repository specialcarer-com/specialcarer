import type { Metadata } from "next";
import ServicePage from "@/components/service-page";

export const metadata: Metadata = {
  title: "Postnatal & newborn care — SpecialCarer",
  description:
    "Maternity nurses, night nannies, and breastfeeding peer support. Newborn-trained, background-checked caregivers across the UK and US.",
};

export default function Page() {
  return (
    <ServicePage
      eyebrow="Postnatal & newborn"
      title="Sleep when you can. We&rsquo;ll watch the baby."
      lede="The first weeks with a newborn are extraordinary — and exhausting. Whether you need overnight help so you can sleep, daytime support to recover, or experienced multiples care, our postnatal-trained caregivers can help."
      bullets={[
        "Maternity nurse cover (24/7 short stays)",
        "Night nannies (10pm–7am typical)",
        "Daytime postnatal support",
        "Breastfeeding peer support",
        "Bottle and combination feeding support",
        "Newborn settling and routine guidance",
        "Sibling care while you bond with baby",
        "Light housekeeping focused on newborn space",
        "Multiples (twins/triplets) experienced caregivers",
        "Postnatal recovery and C-section support",
      ]}
      certifications={[
        "Enhanced DBS (UK)",
        "Checkr criminal-record (US)",
        "Maternity Nurse training (UK)",
        "Newborn Care Specialist (US)",
        "Lactation peer-supporter (BFI / IBCLC pathway)",
        "Paediatric first aid",
        "Safer sleep training (Lullaby Trust / Safe to Sleep)",
      ]}
      faqs={[
        {
          q: "What's the difference between a maternity nurse and a night nanny?",
          a: "A maternity nurse typically lives in for short stays (1–6 weeks) and handles all newborn care 24/7 with a few hours off. A night nanny works overnight only, going home in the morning. Maternity nurses cost more and tend to be more experienced. Both are bookable through SpecialCarer.",
        },
        {
          q: "Are your caregivers IBCLC lactation consultants?",
          a: "A small number are. Most caregivers tagged for breastfeeding support are peer supporters or hold equivalent UK Baby Friendly Initiative certification — they can support latch and positioning but won't diagnose tongue tie or prescribe a feeding plan. For clinical lactation support we'd recommend booking an IBCLC privately or through your hospital.",
        },
        {
          q: "Can a postnatal caregiver give my baby a bottle while I sleep?",
          a: "Yes — if you've expressed milk or arranged formula. The caregiver will follow a schedule you set and log feeds in the app so you can see what happened overnight.",
        },
        {
          q: "Do you support same-sex parents and adoptive families?",
          a: "Of course. The service is equally available to all family structures, and we ask caregivers to confirm they'll support all families when they sign up.",
        },
        {
          q: "When can I book postnatal care?",
          a: "We recommend booking during your second or third trimester for maternity-nurse-style cover, since the most experienced caregivers book up months ahead. For ad-hoc night-nanny shifts, even same-day bookings are often possible.",
        },
      ]}
    />
  );
}
