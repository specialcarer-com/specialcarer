/**
 * Trust & safety reassurance for carers considering the platform.
 * Pure Server Component.
 */

const pillars = [
  {
    title: "DBS-checked community",
    body: "Every carer completes an Enhanced DBS check and identity verification, so families and providers alike know who they are working with.",
  },
  {
    title: "Secure, on-time payments",
    body: "Family payments are held securely and released to you after each completed visit. Providers payments are released to you monthly. You never have to chase an invoice.",
  },
  {
    title: "Support when it matters",
    body: "A UK-based trust & safety team is on hand, and an in-app SOS is one tap away during any active visit.",
  },
  {
    title: "Fair two-way reviews",
    body: "You review families and providers just as they review you. Good carers are protected and recognised.",
  },
];

export default function TrustSection() {
  return (
    <section id="trust" className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#0F1416] sm:text-4xl">
            Built on trust and safety
          </h2>
          <p className="mt-4 text-lg text-[#0F1416]/70">
            We do the heavy lifting on safety so you can focus on great care.
          </p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2">
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-[16px] border border-[#039EA0]/20 p-7"
            >
              <h3 className="text-lg font-bold text-[#039EA0]">
                {pillar.title}
              </h3>
              <p className="mt-3 text-[#0F1416]/70">{pillar.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
