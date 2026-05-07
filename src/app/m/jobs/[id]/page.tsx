"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  TopBar,
  Tag,
  Button,
  IconClock,
  IconCheck,
  IconChatBubble,
  IconPin,
  IconCal,
} from "../../_components/ui";
import {
  getJob,
  SERVICE_LABEL,
  DAY_LABELS,
  TIME_SLOT_LABELS,
  type AvailabilityGrid,
} from "../../_lib/mock";

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const job = getJob(params.id);
  const [applied, setApplied] = useState(job?.status === "Applied");
  const [saved, setSaved] = useState(false);

  if (!job) {
    return (
      <div className="min-h-screen bg-bg-screen p-6">
        <p className="text-sm text-subheading">Job not found.</p>
        <button
          onClick={() => router.push("/m/jobs")}
          className="mt-4 text-sm font-medium text-primary"
        >
          Back to jobs
        </button>
      </div>
    );
  }

  const scrollToTop = () => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-bg-screen pb-32">
      <TopBar title="Job description" back="/m/jobs" />

      <div className="px-5 pt-2">
        {/* Header card: title + top stats + Apply / Save row */}
        <div className="rounded-card bg-white p-5 shadow-card">
          <p className="text-[12px] uppercase tracking-wide text-subheading">
            {SERVICE_LABEL[job.service]} · Posted {job.postedAgo}
          </p>
          <h1 className="mt-1 text-[22px] font-bold leading-snug text-heading">
            {job.title}
          </h1>

          <div className="mt-4 grid grid-cols-3 gap-2 border-y border-line py-4">
            <TopStat
              icon={<IconClock />}
              value={`${job.hoursPerWeekNum}.0`}
              label="hours/week"
            />
            <TopStat
              icon={<IconPin />}
              value={job.city.split(",")[0]}
              label={job.city.includes(",") ? job.city.split(",").slice(1).join(",").trim() : "Location"}
            />
            <TopStat
              icon={<IconCal />}
              value={job.startDate}
              label="Start date"
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button
              block
              disabled={applied}
              onClick={() => setApplied(true)}
            >
              {applied ? "Applied" : "Apply"}
            </Button>
            <button
              onClick={() => setSaved((s) => !s)}
              className={`grid h-12 shrink-0 place-items-center gap-1.5 rounded-btn border px-4 text-[13px] font-semibold transition-colors ${
                saved
                  ? "border-primary bg-primary-50 text-primary"
                  : "border-line bg-white text-heading"
              }`}
              aria-pressed={saved}
              aria-label={saved ? "Unsave job" : "Save job"}
            >
              <span className="flex items-center gap-1.5">
                <IconHeart filled={saved} />
                {saved ? "Saved" : "Save Job"}
              </span>
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between text-[12px] text-subheading">
            <span>Posted by {job.postedBy}</span>
            <Tag tone={job.status === "Open" ? "green" : job.status === "Applied" ? "primary" : "neutral"}>
              {job.status}
            </Tag>
          </div>
        </div>

        {/* Job Description */}
        <Section title="Job Description">
          <p className="text-[14px] leading-relaxed text-subheading">
            {job.description}
          </p>
        </Section>

        {/* Requirements */}
        <Section title="Requirements">
          <ul className="flex flex-col gap-2">
            {job.requirements.map((r) => (
              <li
                key={r}
                className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-50 text-primary">
                  <IconCheck />
                </span>
                <span className="text-[14px] text-heading">{r}</span>
              </li>
            ))}
          </ul>

          <h3 className="mt-5 mb-2 text-[13px] font-semibold uppercase tracking-wide text-subheading">
            Care Needs
          </h3>
          <div className="flex flex-wrap gap-2">
            {job.careNeeds.map((n) => (
              <span
                key={n}
                className="rounded-full bg-white px-3 py-1.5 text-[13px] text-heading shadow-card"
              >
                {n}
              </span>
            ))}
          </div>
        </Section>

        {/* Schedule */}
        <Section title="Schedule">
          <div className="rounded-card bg-white p-4 shadow-card">
            <div className="grid grid-cols-3 gap-3 border-b border-line pb-3 text-center">
              <ScheduleStat value={`${job.hoursPerWeekNum}.0`} label="hours/week" />
              <ScheduleStat value={job.startDate} label="Ideal start" />
              <ScheduleStat value={job.daysPerWeek} label="Days" />
            </div>
            <div className="pt-4">
              <AvailabilityGridView grid={job.availability} />
            </div>
          </div>
        </Section>

        {/* Caregiver Qualifications */}
        <Section title="Caregiver Qualifications">
          <ul className="flex flex-col gap-2">
            {job.qualifications.map((q) => (
              <li
                key={q}
                className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-card"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-50 text-primary">
                  <IconCheck />
                </span>
                <span className="text-[14px] text-heading">{q}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Footer: return to top + Apply + Job ID */}
        <div className="mt-6 flex flex-col items-center gap-4">
          <button
            onClick={scrollToTop}
            className="text-[13px] font-semibold text-primary underline-offset-4 hover:underline"
          >
            Return to top
          </button>
          <Button
            disabled={applied}
            onClick={() => setApplied(true)}
          >
            {applied ? "Applied" : "Apply"}
          </Button>
          <p className="text-[12px] text-subheading">Job ID {job.displayId}</p>
        </div>
      </div>

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/m/chat")}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-btn bg-primary-50 text-primary"
            aria-label="Message"
          >
            <IconChatBubble />
          </button>
          <button
            onClick={() => setSaved((s) => !s)}
            className={`grid h-14 w-14 shrink-0 place-items-center rounded-btn border transition-colors ${
              saved
                ? "border-primary bg-primary-50 text-primary"
                : "border-line bg-white text-heading"
            }`}
            aria-pressed={saved}
            aria-label={saved ? "Unsave job" : "Save job"}
          >
            <IconHeart filled={saved} />
          </button>
          <Button
            block
            disabled={applied}
            onClick={() => setApplied(true)}
          >
            {applied ? "Applied" : "Apply now"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-[16px] font-bold text-heading">{title}</h2>
      {children}
    </section>
  );
}

function TopStat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-primary">{icon}</span>
      <p className="mt-1 text-[14px] font-semibold leading-tight text-heading">
        {value}
      </p>
      <p className="text-[11px] leading-tight text-subheading">{label}</p>
    </div>
  );
}

function ScheduleStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[14px] font-semibold text-heading">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-subheading">
        {label}
      </p>
    </div>
  );
}

function AvailabilityGridView({ grid }: { grid: AvailabilityGrid }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      {/* Header row */}
      <div className="grid grid-cols-[64px_repeat(4,1fr)] bg-muted">
        <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-subheading">
          Day
        </div>
        {TIME_SLOT_LABELS.map((slot) => (
          <div
            key={slot}
            className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-subheading"
          >
            {slot}
          </div>
        ))}
      </div>

      {/* Day rows */}
      {DAY_LABELS.map((day, dayIdx) => (
        <div
          key={day}
          className={`grid grid-cols-[64px_repeat(4,1fr)] ${
            dayIdx < DAY_LABELS.length - 1 ? "border-b border-line" : ""
          }`}
        >
          <div className="px-2 py-3 text-[12px] font-semibold text-heading">
            {day}
          </div>
          {grid[dayIdx].map((on, slotIdx) => (
            <div
              key={slotIdx}
              className="grid place-items-center px-1 py-3"
              aria-label={`${day} ${TIME_SLOT_LABELS[slotIdx]}: ${
                on ? "available" : "not set"
              }`}
            >
              <span
                className={`block h-3 w-3 rounded-full ${
                  on ? "bg-orange-500" : "bg-line"
                }`}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function IconHeart({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
