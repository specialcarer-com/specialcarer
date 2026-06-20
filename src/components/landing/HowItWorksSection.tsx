/**
 * Three-step onboarding overview for prospective founding carers.
 * Pure Server Component.
 */

const steps = [
  {
    step: "1",
    title: "Create your profile",
    body: "Tell families and providers about your experience, the care you offer, and where you work. It takes about ten minutes.",
  },
  {
    step: "2",
    title: "Get verified",
    body: "Complete identity and DBS checks so families and providers know they can trust you. We guide you through every step.",
  },
  {
    step: "3",
    title: "Start caring",
    body: "Go live, accept the bookings that suit you, and get paid securely after each visit.",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-[#F4EFE6]">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#0F1416] sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg text-[#0F1416]/70">
            From sign-up to your first booking in three simple steps.
          </p>
        </div>
        <ol className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((item) => (
            <li
              key={item.step}
              className="rounded-[16px] bg-white p-8 shadow-sm"
            >
              <span
                aria-hidden="true"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[#039EA0] text-xl font-bold text-white"
              >
                {item.step}
              </span>
              <h3 className="mt-5 text-lg font-bold text-[#0F1416]">
                {item.title}
              </h3>
              <p className="mt-3 text-[#0F1416]/70">{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
