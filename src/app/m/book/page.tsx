import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BottomNav, TopBar } from "../_components/ui";
import CareFormatChooser from "../../book/care-format-chooser";
import type { Country } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Book care · SpecialCarer",
};

export const dynamic = "force-dynamic";

export default async function MobileBookEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ when?: string }>;
}) {
  const sp = await searchParams;
  const when = Array.isArray(sp.when) ? sp.when[0] : sp.when;
  if (when === "now" || when === "schedule" || when === "recurring") {
    redirect(`/m/book/visiting?when=${when}`);
  }

  const reqHeaders = await headers();
  const ipCountry = (
    reqHeaders.get("x-vercel-ip-country") ||
    reqHeaders.get("cf-ipcountry") ||
    ""
  ).toUpperCase();
  const country: Country = ipCountry === "US" ? "US" : "GB";

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Book care" back="/m/home" />
      <div className="px-4 pt-3 pb-2">
        <h1 className="text-[20px] font-bold text-heading">
          What kind of care?
        </h1>
        <p className="mt-1 text-[13px] text-subheading">
          Pick the one that fits — we&rsquo;ll take it from there.
        </p>
      </div>
      <CareFormatChooser surface="mobile" country={country} />
      <BottomNav active="home" role="seeker" />
    </main>
  );
}
