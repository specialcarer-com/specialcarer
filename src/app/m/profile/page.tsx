"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  TopBar,
  BottomNav,
  Avatar,
  Button,
  IconChevronRight,
  IconUser,
  IconLock,
  IconCert,
  IconStar,
  IconClock,
  IconCard,
  IconBag,
  IconLogout,
  IconTrash,
} from "../_components/ui";
import { createClient } from "@/lib/supabase/client";

type Row = {
  href: string;
  icon: React.ReactNode;
  label: string;
  destructive?: boolean;
};

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "Account",
    rows: [
      { href: "/m/profile/edit", icon: <IconUser />, label: "Edit profile" },
      { href: "/m/profile/change-password", icon: <IconLock />, label: "Change password" },
      { href: "/m/profile/payment-method", icon: <IconCard />, label: "Payment method" },
      { href: "/m/profile/invoices", icon: <IconBag />, label: "Invoices" },
    ],
  },
  {
    title: "Care profile",
    rows: [
      { href: "/m/profile/certifications", icon: <IconCert />, label: "Certifications" },
      { href: "/m/profile/availability", icon: <IconClock />, label: "Availability" },
      { href: "/m/profile/reviews", icon: <IconStar />, label: "My reviews" },
      { href: "/m/profile/my-clients", icon: <IconUser />, label: "My clients" },
    ],
  },
];

export default function ProfilePage() {
  const router = useRouter();
  const [name, setName] = useState("Jane Cooper");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setEmail(data.user.email ?? "");
        const meta = (data.user.user_metadata || {}) as Record<string, unknown>;
        const fullName = (meta.full_name as string) || (meta.name as string);
        if (fullName) setName(fullName);
      }
    });
  }, []);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/m/login");
  }

  return (
    <div className="min-h-screen bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Profile" />

      {/* Header card */}
      <div className="px-5 pt-2">
        <div className="rounded-card bg-white p-4 shadow-card">
          <div className="flex items-center gap-4">
            <Avatar size={64} name={name} />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold text-heading">{name}</p>
              <p className="truncate text-[12.5px] text-subheading">
                {email || "Loading…"}
              </p>
            </div>
          </div>
          <Link
            href="/m/profile/edit"
            className="mt-3 inline-flex h-9 items-center rounded-pill bg-primary-50 px-4 text-[13px] font-semibold text-primary"
          >
            View / edit profile
          </Link>
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map((s) => (
        <div key={s.title} className="px-5 pt-6">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subheading">
            {s.title}
          </p>
          <ul className="overflow-hidden rounded-card bg-white shadow-card">
            {s.rows.map((r, i) => (
              <li key={r.href} className={i > 0 ? "border-t border-line" : ""}>
                <Link
                  href={r.href}
                  className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/60"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-50 text-primary">
                    {r.icon}
                  </span>
                  <span className="flex-1 text-[14.5px] font-medium text-heading">
                    {r.label}
                  </span>
                  <IconChevronRight />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Danger zone */}
      <div className="px-5 pt-6">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subheading">
          More
        </p>
        <ul className="overflow-hidden rounded-card bg-white shadow-card">
          <li>
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-muted/60"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-heading">
                <IconLogout />
              </span>
              <span className="flex-1 text-[14.5px] font-medium text-heading">
                Log out
              </span>
              <IconChevronRight />
            </button>
          </li>
          <li className="border-t border-line">
            <Link
              href="/m/profile/delete-account"
              className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/60"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#FFE9E9] text-[#D9534F]">
                <IconTrash />
              </span>
              <span className="flex-1 text-[14.5px] font-medium text-[#D9534F]">
                Delete account
              </span>
              <IconChevronRight />
            </Link>
          </li>
        </ul>
      </div>

      <div className="px-5 pt-6 pb-2">
        <p className="text-center text-[11px] text-subheading">
          SpecialCarer · v1.0.0 · All Care 4 U Group Ltd
        </p>
      </div>

      <BottomNav active="profile" />
    </div>
  );
}
