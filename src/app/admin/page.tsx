import Link from "next/link";
import { getKpis, fmtCents } from "@/lib/admin/kpis";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const k = await getKpis();

  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: "Demand",
      tiles: [
        { label: "Signups · 24h", value: k.signupsLast24h.toString() },
        { label: "Signups · 7d", value: k.signupsLast7d.toString() },
        { label: "Bookings · today", value: k.bookingsToday.toString() },
        { label: "Bookings · 7d", value: k.bookingsLast7d.toString() },
      ],
    },
    {
      title: "Marketplace value",
      tiles: [
        {
          label: "GMV · 7d",
          value: `${fmtCents(k.gmvLast7dByCurrency.gbp, "gbp")} · ${fmtCents(k.gmvLast7dByCurrency.usd, "usd")}`,
          help: "Sum of subtotal across non-cancelled bookings",
        },
        {
          label: "Platform fee · 7d",
          value: `${fmtCents(k.feeLast7dByCurrency.gbp, "gbp")} · ${fmtCents(k.feeLast7dByCurrency.usd, "usd")}`,
          help: "20% take-rate revenue, 7d window",
        },
        {
          label: "GMV · MTD",
          value: `${fmtCents(k.gmvMtdByCurrency.gbp, "gbp")} · ${fmtCents(k.gmvMtdByCurrency.usd, "usd")}`,
        },
        {
          label: "Completion rate · 30d",
          value: `${(k.completionRate30d * 100).toFixed(0)}%`,
          help: "Completed ÷ (completed + cancelled + refunded), 30d",
        },
      ],
    },
    {
      title: "Operations",
      tiles: [
        {
          label: "Payouts eligible now",
          value: k.payoutsEligibleNow.toString(),
          help: "Completed shifts past 24h hold, awaiting capture",
        },
        {
          label: "Payouts held",
          value: k.payoutsHeld.toString(),
          help: "Completed shifts inside the 24h hold window",
        },
        { label: "Open disputes", value: k.openDisputes.toString(), tone: k.openDisputes > 0 ? "danger" : "default" },
      ],
    },
    {
      title: "Supply",
      tiles: [
        { label: "Caregivers published", value: k.publishedCaregivers.toString() },
        {
          label: "Awaiting review",
          value: k.caregiversAwaitingReview.toString(),
          tone: k.caregiversAwaitingReview > 0 ? "warn" : "default",
          link: { href: "/admin/caregivers", label: "Open queue →" },
        },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Live KPIs across demand, marketplace value, ops, and supply.
          </p>
        </div>
        <Link
          href="/admin/caregivers"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          Caregiver queue →
        </Link>
      </div>

      {groups.map((g) => (
        <section key={g.title}>
          <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-3">
            {g.title}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {g.tiles.map((t) => (
              <KpiTile key={t.label} {...t} />
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-slate-400">
        Refreshes on every page load. Times in UTC. Currency split shown
        side-by-side (GBP · USD).
      </p>
    </div>
  );
}

type Tile = {
  label: string;
  value: string;
  help?: string;
  tone?: "default" | "warn" | "danger";
  link?: { href: string; label: string };
};

function KpiTile({ label, value, help, tone = "default", link }: Tile) {
  const toneCls =
    tone === "danger"
      ? "border-rose-200 bg-rose-50"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border ${toneCls} p-5`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {help && <p className="mt-2 text-xs text-slate-500 leading-snug">{help}</p>}
      {link && (
        <Link
          href={link.href}
          className="mt-3 inline-block text-xs font-medium text-brand-700 hover:underline"
        >
          {link.label}
        </Link>
      )}
    </div>
  );
}
