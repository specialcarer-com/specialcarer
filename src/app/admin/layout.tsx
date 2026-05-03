import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata = {
  title: "Admin — SpecialCarer",
  robots: { index: false, follow: false },
};

const NAV: { href: string; label: string; soon?: boolean }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/caregivers", label: "Caregivers" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/webhooks", label: "Webhooks" },
  { href: "/admin/trust-safety", label: "Trust & safety", soon: true },
  { href: "/admin/finance", label: "Finance", soon: true },
  { href: "/admin/audit-log", label: "Audit log" },
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
            <Link href="/admin" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center text-white font-bold text-xs">
                S
              </div>
              <span className="font-semibold text-slate-900">SpecialCarer</span>
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
            <ul className="space-y-1">
              {NAV.map((n) => (
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
          </nav>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
