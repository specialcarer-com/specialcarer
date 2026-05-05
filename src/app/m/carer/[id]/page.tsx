"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Avatar,
  Button,
  Card,
  IconAward,
  IconCert,
  IconClock,
  IconInfo,
  IconLanguage,
  IconPin,
  IconStar,
  NotificationBell,
  Stars,
  Tabs,
  TopBar,
} from "../../_components/ui";
import {
  CARE_FORMAT_LABEL,
  SERVICE_LABEL,
  getCarer,
} from "../../_lib/mock";

/**
 * Carer profile — Figma 31:445 (About), 35:1155 (Availability),
 * 35:1280 (Reviews). Single screen with three tabs and a sticky
 * "Book" CTA at the bottom.
 */

export default function CarerDetailPage() {
  const params = useParams<{ id: string }>();
  const carer = getCarer(params.id);
  const [tab, setTab] = useState<"about" | "availability" | "reviews">("about");

  if (!carer) {
    return (
      <main className="min-h-[100dvh] bg-white">
        <TopBar back="/m/search" title="Professional" />
        <div className="px-6 mt-10 text-center">
          <p className="text-heading font-semibold">Carer not found</p>
          <Link href="/m/search" className="mt-3 inline-block text-primary font-bold">
            Browse carers
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-white pb-32">
      <TopBar
        back="/m/search"
        title="Professionals"
        right={<NotificationBell />}
      />

      {/* Header card */}
      <div className="px-6 mt-2 flex flex-col items-center text-center">
        <Avatar src={carer.photo} name={carer.name} size={112} />
        <h1 className="mt-3 text-[22px] font-bold text-heading">
          {carer.name}
        </h1>
        <p className="mt-1 inline-flex items-center gap-1 text-[13px] text-subheading">
          <IconPin /> {carer.city}
        </p>
        <p className="mt-1 inline-flex items-center gap-3 text-[13px] text-subheading">
          <span className="inline-flex items-center gap-1">
            <IconAward /> {carer.experienceYears}+ years
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1 text-heading font-semibold">
            <IconStar /> {carer.rating.toFixed(1)}
          </span>
        </p>
      </div>

      {/* Tabs */}
      <div className="mt-5">
        <Tabs
          tabs={[
            { key: "about", label: "About" },
            { key: "availability", label: "Availability" },
            { key: "reviews", label: "Reviews" },
          ]}
          active={tab}
          onChange={(k) => setTab(k as typeof tab)}
        />
      </div>

      {/* Tab content */}
      <div className="px-4 mt-4 space-y-4">
        {tab === "about" && (
          <>
            <PanelCard icon={<IconInfo />} title="Details">
              <p className="text-[13px] text-subheading leading-relaxed">
                {carer.about}
              </p>
            </PanelCard>

            <PanelCard icon={<IconClock />} title="Rates">
              <ul className="grid grid-cols-2 gap-2">
                {carer.careFormats.includes("visiting") && (
                  <li className="rounded-btn border border-line p-3">
                    <p className="text-[18px] font-bold text-heading leading-none">
                      £{carer.hourly.gbp}
                      <span className="text-[12px] text-subheading font-normal">
                        {" "}/ hr
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-subheading">
                      {CARE_FORMAT_LABEL.visiting}
                    </p>
                  </li>
                )}
                {carer.careFormats.includes("live_in") && carer.weekly && (
                  <li className="rounded-btn border border-line p-3">
                    <p className="text-[18px] font-bold text-heading leading-none">
                      £{carer.weekly.gbp}
                      <span className="text-[12px] text-subheading font-normal">
                        {" "}/ wk
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-subheading">
                      {CARE_FORMAT_LABEL.live_in}
                    </p>
                  </li>
                )}
              </ul>
              {!carer.careFormats.includes("live_in") && (
                <p className="mt-2 text-[11px] text-subheading">
                  This carer offers visiting care only.
                </p>
              )}
            </PanelCard>

            <PanelCard icon={<IconLanguage />} title="Languages Known">
              <ul className="space-y-1 text-[14px] text-heading">
                {carer.languages.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </PanelCard>

            <PanelCard icon={<IconCert />} title="Certifications">
              <ul className="divide-y divide-line -mx-1">
                {carer.certifications.map((c, i) => (
                  <li key={i} className="flex items-center gap-3 px-1 py-3 first:pt-1 last:pb-1">
                    <span
                      className="shrink-0 w-10 h-10 rounded-full grid place-items-center text-primary"
                      style={{ background: "rgba(3,158,160,0.1)" }}
                      aria-hidden
                    >
                      <CertIcon title={c.title} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-heading leading-tight">
                        {c.title}
                      </p>
                      <p className="text-[12px] text-subheading mt-0.5">
                        Issued {c.issuedAt}
                      </p>
                    </div>
                    <span
                      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#E8F6EC] px-2 py-1 text-[11px] font-semibold text-[#1F7A3F]"
                      aria-label="Verified"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Verified
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 -mx-1 -mb-1 rounded-card bg-bg-screen px-3 py-2.5 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#039EA0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
                <p className="text-[12px] text-subheading">
                  Background-checked by SpecialCarer
                </p>
              </div>
            </PanelCard>
          </>
        )}

        {tab === "availability" && (
          <>
            <PanelCard
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21s-7-4.35-7-10a5 5 0 019-3 5 5 0 019 3c0 5.65-7 10-7 10z" />
                </svg>
              }
              title="Services"
            >
              <ul className="grid grid-cols-3 gap-2">
                {carer.services.map((s) => (
                  <li
                    key={s}
                    className="rounded-btn border border-line p-3 text-center"
                  >
                    <p className="text-[18px] font-bold text-heading leading-none">
                      ${carer.hourly.usd}
                    </p>
                    <p className="mt-1 text-[11px] text-subheading">
                      {SERVICE_LABEL[s]}
                    </p>
                  </li>
                ))}
              </ul>
            </PanelCard>

            <PanelCard icon={<IconClock />} title="Time">
              <ul className="grid grid-cols-2 gap-3">
                {carer.availability.map((day) => (
                  <li
                    key={day.day}
                    className="rounded-btn border border-line p-3"
                  >
                    <p className="text-[14px] font-bold text-heading">
                      {day.day}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {day.slots.map((slot) => (
                        <li key={slot} className="text-[12px] text-subheading">
                          {slot}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </PanelCard>
          </>
        )}

        {tab === "reviews" && (
          <>
            {carer.reviews.length === 0 ? (
              <Card className="text-center py-8">
                <p className="text-heading font-semibold">No reviews yet</p>
                <p className="mt-2 text-[13px] text-subheading">
                  Be the first to leave a review after your first booking.
                </p>
              </Card>
            ) : (
              carer.reviews.map((r) => (
                <Card key={r.id}>
                  <div className="flex items-start gap-3">
                    <Avatar src={r.avatar} name={r.author} size={42} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-bold text-heading">
                        {r.author}
                      </p>
                      <p className="text-[12px] text-subheading">{r.service}</p>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 text-[13px] font-bold text-heading">
                        {r.rating.toFixed(1)} <IconStar />
                      </span>
                      <p className="text-[11px] text-subheading">{r.when}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-[13px] text-heading leading-relaxed">
                    {r.text}
                  </p>
                  <div className="mt-2">
                    <Stars value={r.rating} />
                  </div>
                </Card>
              ))
            )}
          </>
        )}
      </div>

      {/* Sticky Book CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-white border-t border-line px-4 pt-3 sc-safe-bottom">
        <Link href={`/m/book/${carer.id}`}>
          <Button block>Book</Button>
        </Link>
      </div>
    </main>
  );
}

function PanelCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-muted border-b border-line">
        <span className="text-heading">{icon}</span>
        <h3 className="text-[14px] font-bold text-heading">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/**
 * Picks a glyph that matches the certification type. Falls back to a
 * generic shield. We match on lowercase substrings so e.g.
 * "First Aid (Pediatric)" → cross, "Dementia Care Level 3" → brain.
 */
function CertIcon({ title }: { title: string }) {
  const t = title.toLowerCase();
  const props = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (t.includes("first aid") || t.includes("cpr") || t.includes("pediatric")) {
    return (
      <svg {...props} aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  if (t.includes("dementia") || t.includes("mental") || t.includes("autism")) {
    return (
      <svg {...props} aria-hidden>
        <path d="M9 4a4 4 0 00-4 4 4 4 0 00-1 6 4 4 0 002 5 4 4 0 008 0V4a3 3 0 00-3 0z" />
        <path d="M15 4a3 3 0 013 0v15a4 4 0 11-8 0" />
      </svg>
    );
  }
  if (t.includes("heart") || t.includes("cardio") || t.includes("life support")) {
    return (
      <svg {...props} aria-hidden>
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    );
  }
  if (t.includes("child") || t.includes("baby") || t.includes("newborn") || t.includes("postnatal")) {
    return (
      <svg {...props} aria-hidden>
        <circle cx="12" cy="7" r="3" />
        <path d="M5 21v-2a4 4 0 014-4h6a4 4 0 014 4v2" />
      </svg>
    );
  }
  if (t.includes("food") || t.includes("hygiene") || t.includes("safeguard") || t.includes("manual")) {
    return (
      <svg {...props} aria-hidden>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
      </svg>
    );
  }
  // Default: shield (DBS, CRB, RQF, NVQ, etc.)
  return (
    <svg {...props} aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
