"use client";

import Link from "next/link";
import { TopBar, Avatar, Tag, IconChevronRight } from "../../_components/ui";
import { CLIENTS } from "../../_lib/clients";

export default function MyClientsPage() {
  return (
    <div className="min-h-screen bg-bg-screen pb-8">
      <TopBar title="My clients" back="/m/profile" />

      <ul className="mt-2 flex flex-col gap-3 px-5">
        {CLIENTS.map((c) => (
          <li key={c.id}>
            <Link
              href={`/m/profile/my-clients/${c.id}`}
              className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card active:scale-[0.99]"
            >
              <Avatar src={c.avatar} name={c.name} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[15px] font-semibold text-heading">
                    {c.name}
                  </p>
                  <Tag tone={c.status === "Active" ? "green" : "neutral"}>
                    {c.status}
                  </Tag>
                </div>
                <p className="mt-0.5 text-[12.5px] text-subheading">
                  {c.service} · {c.city}
                </p>
                <p className="mt-1 text-[11.5px] text-subheading">
                  Started {c.startedAt}
                </p>
              </div>
              <IconChevronRight />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
