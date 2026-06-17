/**
 * Server-side data helpers for carer qualifications + verification status
 * (PR-R2 of the mobile redesign).
 *
 * Both helpers are flag-aware. With NEXT_PUBLIC_MOBILE_REDESIGN_ENABLED on
 * they read the structured PR-R2 schema (public.carer_qualifications +
 * caregiver_profiles.verified_status). With the flag off they fall back to the
 * legacy heuristic — qualifications derived from caregiver_profiles.certifications
 * and "verified" derived from the existence of an approved background_check — so
 * nothing breaks while the redesign is dark.
 *
 * The query logic is split into pure functions that take a minimal Supabase
 * client interface, so unit tests can drive them with a stub (matches the
 * pattern in src/lib/carers/recent-handler.ts). The default exports resolve the
 * real server client lazily.
 */
import { isMobileRedesignEnabled } from "@/lib/mobile-redesign/flag";

export type QualificationKind =
  | "NVQ_L2"
  | "NVQ_L3"
  | "NVQ_L4"
  | "NVQ_L5"
  | "RMN"
  | "RGN"
  | "CARE_CERT"
  | "DIPLOMA_HEALTH_SOCIAL_CARE"
  | "OTHER";

export type Qualification = {
  id: string;
  kind: QualificationKind;
  label: string | null;
  awardingBody: string | null;
  awardedOn: string | null; // ISO date (YYYY-MM-DD)
  verifiedAt: string | null; // ISO timestamp; non-null for verified rows
};

export type VerifiedStatus = "pending" | "verified" | "rejected" | "expired";

export type CarerVerifiedStatus = {
  status: VerifiedStatus;
  at: Date | null;
};

/* ── minimal Supabase client shapes (only what we touch) ─────────────────── */

type QueryResult<T> = Promise<{
  data: T[] | null;
  error: { message: string } | null;
}>;

type MaybeResult<T> = Promise<{
  data: T | null;
  error: { message: string } | null;
}>;

type QualificationRow = {
  id: string;
  kind: QualificationKind;
  label: string | null;
  awarding_body: string | null;
  awarded_on: string | null;
  verified_at: string | null;
};

type ProfileVerifiedRow = {
  verified_status: string | null;
  verified_at: string | null;
  certifications: string[] | null;
};

type BackgroundCheckRow = {
  status: string | null;
};

/**
 * The slice of the Supabase client the helpers rely on. Deliberately narrow so
 * tests can stub it without the full @supabase/supabase-js types.
 */
export type QualificationsClient = {
  from(table: "carer_qualifications"): {
    select(cols: string): {
      eq(
        col: "carer_id",
        value: string,
      ): {
        not(
          col: "verified_at",
          op: "is",
          value: null,
        ): {
          order(
            col: "awarded_on",
            opts: { ascending: boolean; nullsFirst: boolean },
          ): QueryResult<QualificationRow>;
        };
      };
    };
  };
  from(table: "caregiver_profiles"): {
    select(cols: string): {
      eq(
        col: "user_id",
        value: string,
      ): {
        maybeSingle(): MaybeResult<ProfileVerifiedRow>;
      };
    };
  };
  from(table: "background_checks"): {
    select(cols: string): {
      eq(
        col: "caregiver_id",
        value: string,
      ): {
        eq(col: "status", value: string): {
          limit(n: number): QueryResult<BackgroundCheckRow>;
        };
      };
    };
  };
};

/* ── kind inference (heuristic fallback) ─────────────────────────────────── */

/**
 * Best-effort mapping of a free-text certification string to a structured
 * QualificationKind. Only used in the flag-off fallback path so the redesigned
 * <CarerCard> can still render chips off the legacy certifications text[].
 */
export function inferQualificationKind(cert: string): QualificationKind {
  const c = cert.toLowerCase();
  if (c.includes("nvq")) {
    if (c.includes("5")) return "NVQ_L5";
    if (c.includes("4")) return "NVQ_L4";
    if (c.includes("3")) return "NVQ_L3";
    if (c.includes("2")) return "NVQ_L2";
  }
  if (c.includes("rmn")) return "RMN";
  if (c.includes("rgn")) return "RGN";
  if (c.includes("care certificate") || c.includes("care cert")) {
    return "CARE_CERT";
  }
  if (c.includes("diploma") && (c.includes("health") || c.includes("social"))) {
    return "DIPLOMA_HEALTH_SOCIAL_CARE";
  }
  return "OTHER";
}

/* ── qualifications ──────────────────────────────────────────────────────── */

/**
 * Verified qualifications for a carer.
 *
 * Flag ON: structured rows from carer_qualifications where verified_at is set.
 * Flag OFF: legacy certifications text[] mapped to OTHER-ish kinds. Heuristic
 * rows have no real id/verifiedAt, so we synthesise stable-ish placeholders.
 */
export async function getCarerQualificationsWith(
  client: QualificationsClient,
  carerId: string,
  enabled: boolean,
): Promise<Qualification[]> {
  if (enabled) {
    const { data, error } = await client
      .from("carer_qualifications")
      .select("id, kind, label, awarding_body, awarded_on, verified_at")
      .eq("carer_id", carerId)
      .not("verified_at", "is", null)
      .order("awarded_on", { ascending: false, nullsFirst: false });

    if (error) {
      throw new Error(
        `getCarerQualifications: ${error.message}`,
      );
    }

    return (data ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      awardingBody: r.awarding_body,
      awardedOn: r.awarded_on,
      verifiedAt: r.verified_at,
    }));
  }

  // Fallback: derive from caregiver_profiles.certifications.
  const { data, error } = await client
    .from("caregiver_profiles")
    .select("verified_status, verified_at, certifications")
    .eq("user_id", carerId)
    .maybeSingle();

  if (error) {
    throw new Error(`getCarerQualifications (fallback): ${error.message}`);
  }

  const certs = (data?.certifications ?? []).filter(
    (c): c is string => typeof c === "string" && c.trim().length > 0,
  );

  return certs.map((cert, i) => ({
    id: `legacy:${carerId}:${i}`,
    kind: inferQualificationKind(cert),
    label: cert,
    awardingBody: null,
    awardedOn: null,
    verifiedAt: null,
  }));
}

/* ── verified status ─────────────────────────────────────────────────────── */

const VALID_STATUSES: readonly VerifiedStatus[] = [
  "pending",
  "verified",
  "rejected",
  "expired",
];

function coerceStatus(value: string | null | undefined): VerifiedStatus {
  return VALID_STATUSES.includes(value as VerifiedStatus)
    ? (value as VerifiedStatus)
    : "pending";
}

/**
 * Canonical verification status for a carer.
 *
 * Flag ON: reads caregiver_profiles.verified_status / verified_at.
 * Flag OFF: legacy heuristic — verified iff an approved background_check exists.
 */
export async function getCarerVerifiedStatusWith(
  client: QualificationsClient,
  carerId: string,
  enabled: boolean,
): Promise<CarerVerifiedStatus> {
  if (enabled) {
    const { data, error } = await client
      .from("caregiver_profiles")
      .select("verified_status, verified_at, certifications")
      .eq("user_id", carerId)
      .maybeSingle();

    if (error) {
      throw new Error(`getCarerVerifiedStatus: ${error.message}`);
    }

    const status = coerceStatus(data?.verified_status);
    const at =
      status === "verified" && data?.verified_at
        ? new Date(data.verified_at)
        : null;
    return { status, at };
  }

  // Fallback: approved background_check => verified.
  const { data, error } = await client
    .from("background_checks")
    .select("status")
    .eq("caregiver_id", carerId)
    .eq("status", "approved")
    .limit(1);

  if (error) {
    throw new Error(`getCarerVerifiedStatus (fallback): ${error.message}`);
  }

  const verified = (data ?? []).length > 0;
  return { status: verified ? "verified" : "pending", at: null };
}

/* ── public entry points (resolve the real server client) ────────────────── */

export async function getCarerQualifications(
  carerId: string,
): Promise<Qualification[]> {
  const { createClient } = await import("@/lib/supabase/server");
  const client = (await createClient()) as unknown as QualificationsClient;
  return getCarerQualificationsWith(
    client,
    carerId,
    isMobileRedesignEnabled(),
  );
}

export async function getCarerVerifiedStatus(
  carerId: string,
): Promise<CarerVerifiedStatus> {
  const { createClient } = await import("@/lib/supabase/server");
  const client = (await createClient()) as unknown as QualificationsClient;
  return getCarerVerifiedStatusWith(
    client,
    carerId,
    isMobileRedesignEnabled(),
  );
}

/* ── presentation helper for <CarerCard> qualification chips ─────────────── */

const KIND_LABELS: Record<QualificationKind, string> = {
  NVQ_L2: "NVQ L2",
  NVQ_L3: "NVQ L3",
  NVQ_L4: "NVQ L4",
  NVQ_L5: "NVQ L5",
  RMN: "RMN",
  RGN: "RGN",
  CARE_CERT: "Care Certificate",
  DIPLOMA_HEALTH_SOCIAL_CARE: "Diploma H&SC",
  OTHER: "Qualified",
};

/**
 * Short chip label for a qualification, used by <CarerCard>. Prefers a concise
 * canonical label for the kind; falls back to the free-text label for OTHER.
 */
export function qualificationChipLabel(q: Qualification): string {
  if (q.kind === "OTHER" && q.label) return q.label;
  return KIND_LABELS[q.kind];
}
