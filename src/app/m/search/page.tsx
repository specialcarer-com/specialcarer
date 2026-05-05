"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Avatar,
  BottomNav,
  Button,
  Card,
  IconFilter,
  IconPin,
  IconSearch,
  IconStar,
  Tag,
  TopBar,
} from "../_components/ui";
import { CAREGIVERS, SERVICE_LABEL } from "../_lib/mock";

/**
 * Search / discovery — there's no Figma frame for this exact screen
 * (the design jumps from Home to Carer Profile), so we built a clean
 * one consistent with the design system: search bar at top, scrollable
 * service-chip filters, then the same card style as Home.
 */

const SERVICES = [
  { key: "all", label: "All" },
  { key: "child", label: "Child Care" },
  { key: "elderly", label: "Elderly Care" },
  { key: "postnatal", label: "Postnatal" },
  { key: "special", label: "Special-needs" },
] as const;

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [service, setService] = useState<(typeof SERVICES)[number]["key"]>("all");

  const results = useMemo(() => {
    return CAREGIVERS.filter((c) => {
      if (service !== "all" && !c.services.includes(service as never)) return false;
      if (!q.trim()) return true;
      const needle = q.trim().toLowerCase();
      return (
        c.name.toLowerCase().includes(needle) ||
        c.city.toLowerCase().includes(needle) ||
        c.languages.some((l) => l.toLowerCase().includes(needle))
      );
    });
  }, [q, service]);

  return (
    <main className="min-h-[100dvh] bg-bg-screen sc-with-bottom-nav">
      <TopBar back="/m/home" title="Find a Carer" />

      <div className="px-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-12 rounded-btn border border-line bg-white px-4 flex items-center gap-2">
            <IconSearch />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, city or language"
              className="flex-1 bg-transparent outline-none text-[14px] text-heading placeholder:text-[#A3A3A3]"
            />
          </div>
          <button
            aria-label="Filter"
            className="h-12 w-12 rounded-btn bg-primary text-white grid place-items-center sc-no-select"
          >
            <IconFilter />
          </button>
        </div>

        {/* Service chips */}
        <div className="mt-3 -mx-4 px-4 flex gap-2 overflow-x-auto pb-2 sc-no-select">
          {SERVICES.map((s) => {
            const active = s.key === service;
            return (
              <button
                key={s.key}
                onClick={() => setService(s.key)}
                className={`shrink-0 h-9 px-4 rounded-pill text-[13px] font-semibold transition ${
                  active
                    ? "bg-primary text-white"
                    : "bg-white text-subheading border border-line"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[12px] text-subheading">
          {results.length} {results.length === 1 ? "carer" : "carers"} found
        </p>
      </div>

      <div className="px-4 mt-3 space-y-4">
        {results.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start gap-3">
              <Avatar src={c.photo} name={c.name} size={56} />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[16px] font-bold text-heading truncate">
                    {c.name}
                  </p>
                  <span className="flex items-center gap-1 text-[13px] font-bold text-heading shrink-0">
                    {c.rating.toFixed(1)} <IconStar />
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {c.services.slice(0, 2).map((s) => (
                    <Tag key={s} tone="primary">
                      {SERVICE_LABEL[s]}
                    </Tag>
                  ))}
                </div>
              </div>
            </div>

            <ul className="mt-3 space-y-2 text-[13px] text-heading">
              <li className="flex items-center gap-2">
                <span className="text-subheading"><IconPin /></span>
                {c.city}
              </li>
            </ul>

            <div className="border-t border-line mt-4 pt-3 flex items-center justify-between">
              <p className="text-[12px] text-subheading">
                <span className="text-[18px] font-bold text-heading">
                  ${c.hourly.usd}
                </span>
                <span className="text-[12px] text-subheading">/hr</span>
              </p>
              <Link href={`/m/carer/${c.id}`}>
                <Button size="md">See Profile</Button>
              </Link>
            </div>
          </Card>
        ))}

        {results.length === 0 && (
          <Card className="text-center py-10">
            <p className="text-heading font-semibold">No carers found</p>
            <p className="mt-2 text-[13px] text-subheading">
              Try a different name, city, or service category.
            </p>
          </Card>
        )}
      </div>

      <BottomNav active="home" role="seeker" />
    </main>
  );
}
