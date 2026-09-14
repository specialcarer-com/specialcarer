import Link from "next/link";

type Tab = { href: string; label: string };

const BASE_TABS: Tab[] = [
  { href: "/admin/finance", label: "Overview" },
  { href: "/admin/finance/payouts", label: "Payouts" },
  { href: "/admin/finance/disputes", label: "Disputes" },
  { href: "/admin/finance/fraud", label: "Fraud signals" },
  { href: "/admin/finance/tax-docs", label: "Tax documents" },
];

// E1 admin dashboard is behind a flag; the route itself is protected by
// requireAdmin(), the flag just hides the nav link. Default off.
function buildTabs(): Tab[] {
  const tabs = [...BASE_TABS];
  if (process.env.NEXT_PUBLIC_ADMIN_FINANCE_V2 === "true") {
    tabs.push({ href: "/admin/finance/refunds", label: "Refunds" });
  }
  return tabs;
}

/**
 * Sub-tab navigation for the Finance section. Receives the active tab
 * href and renders the row. Intended to be embedded at the top of each
 * Finance sub-page.
 */
export default function FinanceTabs({ active }: { active: string }) {
  const tabs = buildTabs();
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Finance sections">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`text-xs px-3 py-1.5 rounded-full border ${
            active === t.href
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
