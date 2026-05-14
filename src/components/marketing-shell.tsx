import { ReactNode } from "react";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";

export default function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col bg-white">
      <SiteHeader />
      <div id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">{children}</div>
      <SiteFooter />
    </main>
  );
}
