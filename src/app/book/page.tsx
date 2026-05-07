import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import MarketingShell from "@/components/marketing-shell";
import CareFormatChooser from "./care-format-chooser";
import type { Country } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Book care · SpecialCarer",
  description:
    "Choose visiting or live-in care. Vetted carers, transparent pricing, escrowed payments.",
};

export const dynamic = "force-dynamic";

export default async function BookEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ when?: string }>;
}) {
  const sp = await searchParams;

  // Preserve existing deep-links from the homepage CTAs:
  // /book?when=now and /book?when=schedule should land in the visiting flow
  // so the When picker still works as a single-tap entry point.
  const when = Array.isArray(sp.when) ? sp.when[0] : sp.when;
  if (when === "now" || when === "schedule" || when === "recurring") {
    redirect(`/book/visiting?when=${when}`);
  }

  const reqHeaders = await headers();
  const ipCountry = (
    reqHeaders.get("x-vercel-ip-country") ||
    reqHeaders.get("cf-ipcountry") ||
    ""
  ).toUpperCase();
  const country: Country = ipCountry === "US" ? "US" : "GB";

  return (
    <MarketingShell>
      <div className="pt-10 sm:pt-14 pb-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            What kind of care do you need?
          </h1>
          <p className="mt-2 text-slate-600 max-w-xl mx-auto">
            Two simple paths. Pick the one that fits your situation &mdash;
            we&rsquo;ll take it from there.
          </p>
        </div>
      </div>
      <CareFormatChooser surface="web" country={country} />
    </MarketingShell>
  );
}
