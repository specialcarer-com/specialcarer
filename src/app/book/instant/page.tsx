import InstantBookClient from "./instant-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Instant booking · SpecialCarer",
  description:
    "Book the nearest available carer right now. Confirmed in minutes.",
};

export default function InstantBookPage() {
  return (
    <main className="min-h-screen bg-screen">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <header className="mb-6">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
            <span aria-hidden>⚡</span> Instant booking
          </div>
          <h1 className="mt-3 text-3xl sm:text-4xl font-semibold text-slate-900">
            Find a carer for right now
          </h1>
          <p className="mt-2 text-slate-600">
            Tell us where, when, and what you need. We&rsquo;ll find the
            nearest available carer and you can book in one tap.
          </p>
        </header>

        <InstantBookClient />
      </div>
    </main>
  );
}
