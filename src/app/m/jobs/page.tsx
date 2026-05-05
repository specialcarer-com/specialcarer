"use client";

import Link from "next/link";
import { useState } from "react";
import {
  TopBar,
  BottomNav,
  Avatar,
  Tag,
  IconSearch,
  IconPin,
  IconClock,
} from "../_components/ui";
import { JOBS, SERVICE_LABEL, type JobStatus } from "../_lib/mock";

const FILTERS: { key: "All" | JobStatus; label: string }[] = [
  { key: "All", label: "All" },
  { key: "Open", label: "Open" },
  { key: "Applied", label: "Applied" },
  { key: "Closed", label: "Closed" },
];

export default function JobsFeedPage() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"All" | JobStatus>("All");

  const list = JOBS.filter((j) => {
    if (filter !== "All" && j.status !== filter) return false;
    if (!q) return true;
    const hay = `${j.title} ${j.city} ${j.postedBy}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-bg-screen sc-with-bottom-nav">
      <TopBar title="Jobs near you" />

      <div className="px-5 pt-2">
        <label className="flex h-12 items-center gap-3 rounded-2xl bg-muted px-4">
          <IconSearch />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search jobs"
            className="flex-1 bg-transparent text-[15px] text-heading placeholder:text-subheading focus:outline-none"
          />
        </label>
      </div>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-pill px-4 py-2 text-sm font-semibold transition ${
              filter === f.key
                ? "bg-primary text-white"
                : "bg-white text-subheading shadow-card"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="mt-4 flex flex-col gap-3 px-5">
        {list.length === 0 && (
          <li className="rounded-card bg-white p-6 text-center text-sm text-subheading shadow-card">
            No jobs match your filters.
          </li>
        )}
        {list.map((job) => (
          <li key={job.id}>
            <Link
              href={`/m/jobs/${job.id}`}
              className="block rounded-card bg-white p-4 shadow-card active:scale-[0.99]"
            >
              <div className="flex items-start gap-3">
                <Avatar src={job.postedAvatar} name={job.postedBy} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-subheading">
                    {job.postedBy} · {job.postedAgo}
                  </p>
                  <h3 className="mt-0.5 line-clamp-2 text-[15px] font-bold text-heading">
                    {job.title}
                  </h3>
                </div>
                <Tag
                  tone={
                    job.status === "Open"
                      ? "green"
                      : job.status === "Applied"
                      ? "primary"
                      : "neutral"
                  }
                >
                  {job.status}
                </Tag>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-subheading">
                <span className="inline-flex items-center gap-1">
                  <IconPin /> {job.city}
                </span>
                <span className="inline-flex items-center gap-1">
                  <IconClock /> {job.hoursPerWeek}
                </span>
                <span className="font-semibold text-heading">
                  £{job.hourly.gbp}/hr · ${job.hourly.usd}/hr
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <Tag tone="neutral">{SERVICE_LABEL[job.service]}</Tag>
                <span className="text-[12px] font-semibold text-primary">View →</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <BottomNav role="carer" active="jobs" />
    </div>
  );
}
