"use client";

/**
 * BookingPreferencesPanel
 *
 * Renders the family's match preferences (stored on `bookings.preferences`
 * jsonb, written by /book/[caregiverId] and /api/stripe/create-booking-intent)
 * in a human-readable form. Read-only.
 *
 * Surfaced on /m/track/[id] for both seeker and carer roles so the carer can
 * prepare for the shift and the seeker can confirm what was sent through.
 *
 * Renders nothing when the booking has no preferences (legacy bookings, or
 * the seeker skipped the optional disclosure).
 */

import { Card, Tag } from "../../../_components/ui";
import { GENDERS, certLabel } from "@/lib/care/attributes";

type Props = {
  preferences: Record<string, unknown> | null;
  role: "seeker" | "caregiver";
};

const genderLabels: Record<string, string> = Object.fromEntries(
  GENDERS.map((g) => [g.key, g.label]),
);

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export default function BookingPreferencesPanel({ preferences, role }: Props) {
  if (!preferences || typeof preferences !== "object") return null;

  const genders = asStringArray(preferences.genders);
  const certs = asStringArray(preferences.required_certifications);
  const langs = asStringArray(preferences.required_languages);
  const tags = asStringArray(preferences.tags);
  const requireDriver = preferences.require_driver === true;
  const requireVehicle = preferences.require_vehicle === true;

  const empty =
    genders.length === 0 &&
    certs.length === 0 &&
    langs.length === 0 &&
    tags.length === 0 &&
    !requireDriver &&
    !requireVehicle;

  if (empty) return null;

  const heading =
    role === "caregiver" ? "What the family asked for" : "Your match preferences";
  const sub =
    role === "caregiver"
      ? "Soft preferences the family selected when booking."
      : "These preferences were sent to your carer.";

  return (
    <Card className="p-4 space-y-3">
      <div>
        <p className="text-[14px] font-bold text-heading">{heading}</p>
        <p className="text-[12px] text-subhead mt-0.5">{sub}</p>
      </div>

      {genders.length > 0 && (
        <Row label="Gender">
          {genders.map((g) => (
            <Tag key={g} tone="primary">
              {genderLabels[g] ?? g}
            </Tag>
          ))}
        </Row>
      )}

      {(requireDriver || requireVehicle) && (
        <Row label="Travel">
          {requireDriver && <Tag tone="primary">Driver</Tag>}
          {requireVehicle && <Tag tone="primary">Has vehicle</Tag>}
        </Row>
      )}

      {certs.length > 0 && (
        <Row label="Certifications">
          {certs.map((c) => (
            <Tag key={c} tone="primary">
              {certLabel(c)}
            </Tag>
          ))}
        </Row>
      )}

      {langs.length > 0 && (
        <Row label="Languages">
          {langs.map((l) => (
            <Tag key={l} tone="neutral">
              {l}
            </Tag>
          ))}
        </Row>
      )}

      {tags.length > 0 && (
        <Row label="Tags">
          {tags.map((t) => (
            <Tag key={t} tone="neutral">
              {t}
            </Tag>
          ))}
        </Row>
      )}
    </Card>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-subhead mb-1.5">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
