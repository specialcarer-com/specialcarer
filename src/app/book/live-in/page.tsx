import type { Metadata } from "next";
import { headers } from "next/headers";
import MarketingShell from "@/components/marketing-shell";
import LiveInForm from "./live-in-form";
import type { Country } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Live-in care · SpecialCarer",
  description:
    "A vetted carer lives in your home for 7+ days. Round-the-clock support, manually matched within 48 hours.",
};

export const dynamic = "force-dynamic";

export default async function LiveInBookPage() {
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
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Live-in care
          </h1>
          <p className="mt-2 text-slate-600">
            A carer lives in your home for 7+ days, providing round-the-clock
            support. Tell us about the placement and we&rsquo;ll match you with
            a vetted carer within 48 hours.
          </p>
        </div>
      </div>
      <LiveInForm surface="web" defaultCountry={country} />
    </MarketingShell>
  );
}
