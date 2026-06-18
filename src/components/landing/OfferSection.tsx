/**
 * What the Founder membership includes. Pure Server Component.
 */

const perks = [
  {
    title: "Founder rate, locked for life",
    body: "Join as one of the first 100 carers and pay £4.99/month forever — even when the standard price rises.",
  },
  {
    title: "Keep more of every booking",
    body: "Families pay through the app and SpecialCarer takes a flat 30% from the carer's side. No hidden add-ons, no surprise deductions.",
  },
  {
    title: "Your schedule, your rules",
    body: "Set your availability, your travel radius, and the care types you offer. Accept only the work that fits your life.",
  },
  {
    title: "Founding-carer badge",
    body: "Stand out to families with a badge that marks you as one of the carers who helped build the platform.",
  },
  {
    title: "Direct line to the team",
    body: "Founders get a priority support channel and a real say in the features we ship next.",
  },
  {
    title: "Get paid reliably",
    body: "Payments are held securely and released after each completed visit, so you always know when your money is coming.",
  },
];

export default function OfferSection() {
  return (
    <section id="offer" className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#0F1416] sm:text-4xl">
            What founding carers get
          </h2>
          <p className="mt-4 text-lg text-[#0F1416]/70">
            A membership built for carers who want to run their own show — at a
            price that never changes.
          </p>
        </div>
        <ul className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {perks.map((perk) => (
            <li
              key={perk.title}
              className="rounded-[16px] border border-[#0F1416]/10 bg-[#F4EFE6]/40 p-7"
            >
              <h3 className="text-lg font-bold text-[#0F1416]">{perk.title}</h3>
              <p className="mt-3 text-[#0F1416]/70">{perk.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
