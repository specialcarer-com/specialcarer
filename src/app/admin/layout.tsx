import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata = {
  title: "Admin — SpecialCarer",
  robots: { index: false, follow: false },
};

type NavItem = { href: string; label: string; soon?: boolean };
type NavSection = { id: string; label?: string; items: NavItem[] };

/**
 * Sidebar navigation. Top-level items (no `label`) render flat — this
 * preserves the original flat layout for the original entries and
 * lets the 3.12 additions live in clearly-labelled groups beneath.
 *
 * 3.12 additions (additive only):
 *  - "Re-verification" added under Trust & safety as a sub-link
 *  - "Application pipeline" added under Caregivers as a sub-link
 *  - New top-level groups: Marketplace ops, Support, CMS, Compliance
 */
const SECTIONS: NavSection[] = [
  {
    id: "core",
    items: [
      { href: "/admin", label: "Overview" },
      { href: "/admin/caregivers", label: "Caregivers" },
      { href: "/admin/caregivers/pipeline", label: "↳ Application pipeline" },
      { href: "/admin/bookings", label: "Bookings" },
      { href: "/admin/org-bookings", label: "Org bookings" },
      { href: "/admin/users", label: "Users" },
      { href: "/admin/memberships", label: "Memberships" },
      { href: "/admin/webhooks", label: "Webhooks" },
      { href: "/admin/trust-safety", label: "Trust & safety" },
      { href: "/admin/trust-safety/re-verify", label: "↳ Re-verification" },
      { href: "/admin/timeoff", label: "Time-off" },
      { href: "/admin/finance", label: "Finance" },
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/audit-log", label: "Audit log" },
    ],
  },
  {
    id: "marketplace-ops",
    label: "Marketplace ops",
    items: [
      { href: "/admin/ops/heatmap", label: "Heatmap" },
      { href: "/admin/ops/surge", label: "Surge rules" },
    ],
  },
  {
    id: "support",
    label: "Support",
    items: [{ href: "/admin/support", label: "Ticket queue" }],
  },
  {
    id: "cms",
    label: "CMS",
    items: [
      { href: "/admin/cms/blog", label: "Blog" },
      { href: "/admin/cms/faq", label: "FAQ" },
      { href: "/admin/cms/banners", label: "Banners (in-app)" },
      { href: "/admin/cms/page-banners", label: "Page banners" },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    items: [
      { href: "/admin/compliance", label: "Compliance dashboard" },
    ],
  },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center" aria-label="SpecialCarer Admin">
              <Image src="/brand/logo.svg" alt="SpecialCarer" width={161} height={121} className="h-8 w-auto" priority />
            </Link>
            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100 text-[11px] font-semibold uppercase tracking-wider">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="hidden sm:inline">{admin.email}</span>
            <Link
              href="/dashboard"
              className="text-slate-600 hover:text-slate-900"
            >
              Exit admin
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-[200px_1fr] gap-6">
        <aside className="lg:sticky lg:top-6 self-start">
          <nav className="bg-white border border-slate-200 rounded-2xl p-2 text-sm">
            {SECTIONS.map((section, idx) => (
              <div
                key={section.id}
                className={idx > 0 ? "mt-3 pt-3 border-t border-slate-100" : ""}
              >
                {section.label && (
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {section.label}
                  </p>
                )}
                <ul className="space-y-1">
                  {section.items.map((n) => (
                    <li key={n.href}>
                      {n.soon ? (
                        <span className="flex items-center justify-between px-3 py-2 rounded-lg text-slate-400 cursor-not-allowed">
                          <span>{n.label}</span>
                          <span className="text-[10px] uppercase tracking-wider text-slate-300">
                            Soon
                          </span>
                        </span>
                      ) : (
                        <Link
                          href={n.href}
                          className="block px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                        >
                          {n.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
