import type { Metadata } from "next";
import { headers } from "next/headers";
import { BottomNav, TopBar } from "../../_components/ui";
import LiveInForm from "../../../book/live-in/live-in-form";
import type { Country } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Live-in care · SpecialCarer",
};

export const dynamic = "force-dynamic";

export default async function MobileLiveInBookPage() {
  const reqHeaders = await headers();
  const ipCountry = (
    reqHeaders.get("x-vercel-ip-country") ||
    reqHeaders.get("cf-ipcountry") ||
    ""
  ).toUpperCase();
  const country: Country = ipCountry === "US" ? "US" : "GB";

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Live-in care" back="/m/book" />
      <div className="px-4 pt-3 pb-2">
        <p className="text-[13px] text-subheading">
          A vetted carer lives in your home for 7+ days. Tell us about the
          placement and we&rsquo;ll match you within 48 hours.
        </p>
      </div>
      <LiveInForm surface="mobile" defaultCountry={country} />
      <BottomNav active="home" role="seeker" />
    </main>
  );
}
