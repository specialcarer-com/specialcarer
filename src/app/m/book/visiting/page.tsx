import type { Metadata } from "next";
import { BottomNav, TopBar } from "../../_components/ui";
import WhenPicker from "../../../book/when-picker";

export const metadata: Metadata = {
  title: "Visiting care · SpecialCarer",
};

type Tab = "now" | "schedule" | "recurring";

function parseTab(when: string | string[] | undefined): Tab {
  const v = Array.isArray(when) ? when[0] : when;
  if (v === "schedule" || v === "recurring") return v;
  return "now";
}

export default async function MobileVisitingBookPage({
  searchParams,
}: {
  searchParams: Promise<{ when?: string }>;
}) {
  const sp = await searchParams;
  const initialTab = parseTab(sp.when);

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Visiting care" back="/m/book" />
      <div className="pt-3">
        <WhenPicker surface="mobile" initialTab={initialTab} />
      </div>
      <BottomNav active="home" role="seeker" />
    </main>
  );
}
