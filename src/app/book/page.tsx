import type { Metadata } from "next";
import MarketingShell from "@/components/marketing-shell";
import WhenPicker from "./when-picker";

export const metadata: Metadata = {
  title: "Book care · SpecialCarer",
  description:
    "One picker for all care: instant, scheduled, or recurring. Live ETAs and transparent hourly pricing in the UK and US.",
};

type Tab = "now" | "schedule" | "recurring";

function parseTab(when: string | string[] | undefined): Tab {
  const v = Array.isArray(when) ? when[0] : when;
  if (v === "schedule" || v === "recurring") return v;
  return "now";
}

export default async function BookEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ when?: string }>;
}) {
  const sp = await searchParams;
  const initialTab = parseTab(sp.when);

  return (
    <MarketingShell>
      <div className="pt-10 sm:pt-14 pb-6">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Book a carer
          </h1>
          <p className="mt-2 text-slate-600">
            Now, later, or every week. One simple flow — held in escrow until
            the shift ends.
          </p>
        </div>
      </div>
      <WhenPicker surface="web" initialTab={initialTab} />
    </MarketingShell>
  );
}
