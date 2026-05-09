import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "./_components/OrgShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organisation — SpecialCarer" };

const NAV: { href: string; label: string; emoji: string; sub: string }[] = [
  {
    href: "/m/org/profile",
    label: "Profile",
    emoji: "🏢",
    sub: "Org info & edit",
  },
  {
    href: "/m/org/team",
    label: "Team",
    emoji: "👥",
    sub: "Multi-seat coming soon",
  },
  {
    href: "/m/org/documents",
    label: "Documents",
    emoji: "📂",
    sub: "Uploads + verification",
  },
  {
    href: "/m/org/billing",
    label: "Billing",
    emoji: "💳",
    sub: "Contact & PO config",
  },
  {
    href: "/m/org/carers",
    label: "Browse carers",
    emoji: "🔎",
    sub: "Save shortlists pre-verification",
  },
  {
    href: "/m/org/bookings",
    label: "Bookings",
    emoji: "📅",
    sub: "Locked until verified",
  },
  {
    href: "/m/org/service-users",
    label: "Service users",
    emoji: "🧑‍🤝‍🧑",
    sub: "Lights up in Phase B",
  },
  {
    href: "/m/org/settings",
    label: "Settings",
    emoji: "⚙️",
    sub: "Account preferences",
  },
];

export default async function OrgOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org");
  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) {
    // Not yet an org user — bounce to registration step 1.
    redirect("/m/org/register/step-1");
  }
  const org = await getOrg(admin, member.organization_id);
  if (!org) {
    redirect("/m/org/register/step-1");
  }

  return (
    <OrgShell
      title="Organisation"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <div className="rounded-card bg-white border border-line p-4">
        <p className="text-[12px] uppercase tracking-wide text-subheading">
          {org.verification_status === "verified"
            ? "Verified organisation"
            : "Welcome"}
        </p>
        <p className="mt-1 text-[18px] font-bold text-heading">
          {org.legal_name ?? "Your organisation"}
        </p>
        {org.trading_name && (
          <p className="text-[12px] text-subheading">
            Trading as {org.trading_name}
          </p>
        )}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-2">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link
              href={n.href}
              className="block rounded-card bg-white border border-line p-3"
            >
              <span className="text-[20px]" aria-hidden>
                {n.emoji}
              </span>
              <p className="mt-1 text-[13px] font-bold text-heading">
                {n.label}
              </p>
              <p className="text-[11px] text-subheading">{n.sub}</p>
            </Link>
          </li>
        ))}
      </ul>
    </OrgShell>
  );
}
