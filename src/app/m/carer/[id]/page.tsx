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
import { SERVICE_LABEL, getCarer } from "../../_lib/mock";

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

            <PanelCard icon={<IconLanguage />} title="Languages Known">
              <ul className="space-y-1 text-[14px] text-heading">
                {carer.languages.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </PanelCard>

            <PanelCard icon={<IconCert />} title="Certifications">
              <ul className="grid grid-cols-3 gap-3">
                {carer.certifications.slice(0, 3).map((c, i) => (
                  <li key={i} className="text-center">
                    <div className="aspect-[4/5] rounded-md bg-[#F8E6BD] grid place-items-center text-[10px] font-bold text-[#8C5C00] p-1 leading-tight">
                      {c.title}
                    </div>
                    <p className="mt-1.5 text-[12px] text-heading font-semibold leading-tight">
                      {c.title}
                    </p>
                    <p className="text-[10px] text-subheading">{c.issuedAt}</p>
                  </li>
                ))}
              </ul>
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
