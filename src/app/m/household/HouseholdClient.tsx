"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, SectionTitle } from "../_components/ui";
import type { HouseholdRecipient, RecipientKind } from "@/lib/recipients/types";

const KIND_META: Record<
  RecipientKind,
  { label: string; emoji: string; description: string }
> = {
  child: {
    label: "Child",
    emoji: "👶",
    description: "Babysitting, school pickup, special-needs",
  },
  senior: {
    label: "Senior",
    emoji: "👵",
    description: "Companion, mobility, medication reminders",
  },
  home: {
    label: "Home",
    emoji: "🏠",
    description: "Address, access, pets",
  },
};

function ageFromDob(dob: string | null): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const ms = Date.now() - d.getTime();
  const yrs = ms / (1000 * 60 * 60 * 24 * 365.25);
  if (yrs < 1) {
    const months = Math.max(0, Math.round(yrs * 12));
    return `${months}mo`;
  }
  return `${Math.floor(yrs)}y`;
}

export default function HouseholdClient({
  initial,
}: {
  initial: HouseholdRecipient[];
}) {
  const [recipients] = useState<HouseholdRecipient[]>(initial);
  const [showPicker, setShowPicker] = useState(false);

  const grouped = {
    child: recipients.filter((r) => r.kind === "child"),
    senior: recipients.filter((r) => r.kind === "senior"),
    home: recipients.filter((r) => r.kind === "home"),
  };

  const isEmpty = recipients.length === 0;

  return (
    <div className="px-4 py-5 space-y-6">
      {isEmpty ? (
        <Card className="p-6 text-center">
          <div className="text-4xl mb-2" aria-hidden>
            🏡
          </div>
          <h2 className="font-semibold text-heading text-lg">
            Set up your household
          </h2>
          <p className="text-sub text-sm mt-1">
            Add the people and places that need care so caregivers know exactly
            what to expect.
          </p>
          <div className="mt-5">
            <Button onClick={() => setShowPicker(true)} block>
              Add a recipient
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {(Object.keys(KIND_META) as RecipientKind[]).map((kind) => {
            const meta = KIND_META[kind];
            const items = grouped[kind];
            if (items.length === 0) return null;
            return (
              <section key={kind} className="space-y-2">
                <SectionTitle title={`${meta.emoji}  ${meta.label}s`} />
                <div className="space-y-2">
                  {items.map((r) => (
                    <RecipientRow key={r.id} r={r} />
                  ))}
                </div>
              </section>
            );
          })}

          <div className="pt-2">
            <Button
              variant="outline"
              onClick={() => setShowPicker(true)}
              block
            >
              Add another
            </Button>
          </div>
        </>
      )}

      {showPicker && (
        <KindPicker
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function RecipientRow({ r }: { r: HouseholdRecipient }) {
  const meta = KIND_META[r.kind];
  const subtitle =
    r.kind === "child"
      ? [
          ageFromDob(r.date_of_birth),
          r.allergies?.length
            ? `${r.allergies.length} allergy${r.allergies.length === 1 ? "" : "ies"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : r.kind === "senior"
        ? [
            r.mobility_level ? r.mobility_level.replace("_", " ") : null,
            r.medications?.length
              ? `${r.medications.length} medication${r.medications.length === 1 ? "" : "s"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : [
            r.city,
            r.has_pets ? "has pets" : null,
          ]
            .filter(Boolean)
            .join(" · ");

  return (
    <Link
      href={`/m/household/${r.id}`}
      className="block bg-white rounded-2xl border border-slate-100 p-4 active:scale-[0.99] transition"
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center text-2xl flex-none">
          {meta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-heading truncate">
            {r.display_name}
          </div>
          {subtitle && (
            <div className="text-xs text-sub truncate">{subtitle}</div>
          )}
        </div>
        <div className="text-sub" aria-hidden>›</div>
      </div>
    </Link>
  );
}

function KindPicker({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-end"
      onClick={onClose}
    >
      <div
        className="w-full bg-white rounded-t-3xl p-5 pb-8 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto" />
        <h2 className="font-semibold text-heading text-lg text-center mt-2">
          Add to your household
        </h2>
        {(Object.keys(KIND_META) as RecipientKind[]).map((k) => {
          const meta = KIND_META[k];
          return (
            <Link
              key={k}
              href={`/m/household/new?kind=${k}`}
              className="flex items-center gap-3 w-full p-4 rounded-2xl border border-slate-200 active:bg-slate-50"
            >
              <div className="text-3xl" aria-hidden>{meta.emoji}</div>
              <div className="flex-1 text-left">
                <div className="font-semibold text-heading">{meta.label}</div>
                <div className="text-xs text-sub">{meta.description}</div>
              </div>
              <div className="text-sub" aria-hidden>›</div>
            </Link>
          );
        })}
        <Button variant="ghost" onClick={onClose} block>
          Cancel
        </Button>
      </div>
    </div>
  );
}
