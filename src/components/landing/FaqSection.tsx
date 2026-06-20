/**
 * FAQ built on native <details>/<summary> so it stays a pure Server
 * Component with zero client JavaScript.
 */

const faqs = [
  {
    q: "How much does it cost to join as a founding carer?",
    a: "Nothing. Founding-carer membership is free for the first 100 carers. There is no subscription and no signup fee — we only earn when you do a booking.",
  },
  {
    q: "How much does SpecialCarer take from my bookings?",
    a: "A flat 30% is deducted from the carer's side of each booking to cover payments, insurance, and platform costs. There is no separate membership fee for founding carers.",
  },
  {
    q: "Do I need to be available at set times?",
    a: "No. You set your own availability, travel radius, and the care types you offer. You only ever accept the bookings that suit you.",
  },
  {
    q: "What checks do I need to complete?",
    a: "You will complete identity verification and an Enhanced DBS check before going live. We guide you through each step inside the app.",
  },
  {
    q: "When and how do I get paid?",
    a: "Family payments are held securely and released to you after each completed visit, so you always know when your money is arriving.",
  },
  {
    q: "Can I leave whenever I want?",
    a: "Yes — there is no long-term contract. You can pause or close your profile anytime. If you later rejoin after the first 100 places are filled, founding-carer status may no longer be available.",
  },
];

export default function FaqSection() {
  return (
    <section id="faq" className="bg-white">
      <div className="mx-auto max-w-3xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#0F1416] sm:text-4xl">
            Frequently asked questions
          </h2>
        </div>
        <div className="mt-12 divide-y divide-[#0F1416]/10 border-y border-[#0F1416]/10">
          {faqs.map((faq) => (
            <details key={faq.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-semibold text-[#0F1416] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#039EA0]">
                {faq.q}
                <span
                  aria-hidden="true"
                  className="flex-none text-2xl font-normal text-[#039EA0] transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-[#0F1416]/70">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
