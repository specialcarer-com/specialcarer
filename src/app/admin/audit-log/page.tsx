import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type AuditRow = {
  id: string;
  admin_id: string;
  admin_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

type TargetSummary = {
  label: string; // human-friendly headline, e.g. "Steve Gis · ★★★★★ review"
  sublabel?: string; // smaller secondary line, e.g. "from Test Family · 09 May 2026"
  href?: string; // optional deep-link to the relevant admin page
};

// ---- Action label map -------------------------------------------------------
// Add new entries as new audit actions are introduced.
const ACTION_LABELS: Record<
  string,
  { label: string; tone: "neutral" | "warn" | "danger" | "success" }
> = {
  "review.hide": { label: "Hid review", tone: "warn" },
  "review.unhide": { label: "Restored review", tone: "success" },
  "booking.mark_disputed": { label: "Marked booking disputed", tone: "warn" },
  "booking.force_release": { label: "Force-released payout", tone: "danger" },
  "booking.refund": { label: "Refunded booking", tone: "danger" },
  "kyc.decision": { label: "KYC decision", tone: "neutral" },
  "user.change_role": { label: "Changed user role", tone: "warn" },
  "webhook.reset": { label: "Reset webhook", tone: "neutral" },
  "caregiver.publish": { label: "Published caregiver", tone: "success" },
  "caregiver.unpublish": { label: "Unpublished caregiver", tone: "warn" },
};

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-rose-50 text-rose-800 border-rose-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function profileName(p: {
  full_name?: string | null;
  email?: string | null;
} | null | undefined): string {
  if (!p) return "Unknown user";
  return p.full_name || p.email || "Unknown user";
}

function ratingStars(n: number): string {
  const filled = "★".repeat(Math.max(0, Math.min(5, n)));
  const empty = "☆".repeat(5 - Math.max(0, Math.min(5, n)));
  return filled + empty;
}

// ---- Detail key humanisation ------------------------------------------------
// Keys that duplicate info already shown elsewhere in the row.
const DETAIL_KEYS_HIDDEN = new Set([
  "reason", // shown above the list
  "target_id",
  "target_type",
  // duplicate of target column for review/kyc/booking
  "caregiver_id",
  "reviewer_id",
  "user_id",
  "override", // shown as a badge next to the action
]);

// Friendly labels for detail keys.
const DETAIL_KEY_LABELS: Record<string, string> = {
  rating: "Rating",
  prior_hidden_at: "Previously hidden",
  prior_status: "Previous status",
  prior_role: "Previous role",
  new_role: "New role",
  target_name: "User",
  display_name: "Caregiver",
  country: "Country",
  ready: "Ready to publish",
  blockers: "Blockers",
  payouts_enabled: "Payouts enabled",
  bg_required: "Required checks",
  bg_cleared: "Cleared checks",
  vendor: "Vendor",
  check_type: "Check type",
  decision: "Decision",
  notes: "Notes",
  event_type: "Event",
  prior_processed_at: "Previously processed",
  prior_error: "Previous error",
  status: "Status",
  amount_cents: "Amount",
  currency: "Currency",
};

function humaniseKey(key: string): string {
  return (
    DETAIL_KEY_LABELS[key] ??
    key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function formatDetailValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (key === "rating" && typeof value === "number") return ratingStars(value);
  if (key === "prior_hidden_at") {
    return value === null || value === undefined ? "No" : `Yes (${fmtDateTime(String(value))})`;
  }
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value)
  ) {
    return fmtDateTime(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    return value.map((v) => String(v)).join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

// ---- Target resolver --------------------------------------------------------
async function resolveTargets(
  rows: AuditRow[]
): Promise<Map<string, TargetSummary>> {
  const out = new Map<string, TargetSummary>();
  if (rows.length === 0) return out;

  const admin = createAdminClient();

  const reviewIds: string[] = [];
  const bookingIds: string[] = [];
  const userIds: string[] = [];
  const bgIds: string[] = [];
  const caregiverIds: string[] = [];

  for (const r of rows) {
    if (!r.target_id) continue;
    switch (r.target_type) {
      case "review":
        reviewIds.push(r.target_id);
        break;
      case "booking":
        bookingIds.push(r.target_id);
        break;
      case "user":
      case "profile":
        userIds.push(r.target_id);
        break;
      case "background_check":
        bgIds.push(r.target_id);
        break;
      case "caregiver":
        caregiverIds.push(r.target_id);
        break;
      default:
        break;
    }
  }

  // Reviews → join to caregiver + reviewer profile
  if (reviewIds.length > 0) {
    const { data } = await admin
      .from("reviews")
      .select(
        "id, rating, caregiver_id, reviewer_id, created_at, hidden_at"
      )
      .in("id", reviewIds);
    const reviews = data ?? [];
    const profileIdsSet = new Set<string>();
    for (const rv of reviews) {
      if (rv.caregiver_id) profileIdsSet.add(rv.caregiver_id);
      if (rv.reviewer_id) profileIdsSet.add(rv.reviewer_id);
    }
    const profileMap = await fetchProfiles(admin, Array.from(profileIdsSet));
    for (const rv of reviews) {
      const cg = profileMap.get(rv.caregiver_id);
      const rv2 = profileMap.get(rv.reviewer_id);
      out.set(rv.id, {
        label: `${profileName(cg)} · ${ratingStars(rv.rating)} review`,
        sublabel: `from ${profileName(rv2)} · ${fmtDate(rv.created_at)}`,
        href: `/admin/trust-safety/reviews`,
      });
    }
  }

  // Bookings
  if (bookingIds.length > 0) {
    const { data } = await admin
      .from("bookings")
      .select(
        "id, seeker_id, caregiver_id, starts_at, total_cents, currency, status"
      )
      .in("id", bookingIds);
    const bookings = data ?? [];
    const profileIdsSet = new Set<string>();
    for (const b of bookings) {
      if (b.seeker_id) profileIdsSet.add(b.seeker_id);
      if (b.caregiver_id) profileIdsSet.add(b.caregiver_id);
    }
    const profileMap = await fetchProfiles(admin, Array.from(profileIdsSet));
    for (const b of bookings) {
      const cg = profileMap.get(b.caregiver_id);
      const sk = profileMap.get(b.seeker_id);
      out.set(b.id, {
        label: `Booking · ${profileName(sk)} → ${profileName(cg)}`,
        sublabel: `${fmtDate(b.starts_at)} · ${b.status}`,
        href: `/admin/bookings/${b.id}`,
      });
    }
  }

  // Users / profiles
  if (userIds.length > 0) {
    const profileMap = await fetchProfiles(admin, userIds);
    for (const id of userIds) {
      const p = profileMap.get(id);
      out.set(id, {
        label: profileName(p),
        sublabel: p?.email ?? undefined,
        href: `/admin/users`,
      });
    }
  }

  // Background checks → resolve to profile
  if (bgIds.length > 0) {
    const { data } = await admin
      .from("background_checks")
      .select("id, user_id, status, vendor, created_at")
      .in("id", bgIds);
    const bcs = data ?? [];
    const profileMap = await fetchProfiles(
      admin,
      bcs.map((b) => b.user_id).filter(Boolean) as string[]
    );
    for (const bc of bcs) {
      const p = profileMap.get(bc.user_id);
      out.set(bc.id, {
        label: `${profileName(p)} · KYC`,
        sublabel: `${bc.vendor ?? "vendor"} · ${bc.status}`,
        href: `/admin/trust-safety/kyc`,
      });
    }
  }

  // Caregivers (publish/unpublish)
  if (caregiverIds.length > 0) {
    const profileMap = await fetchProfiles(admin, caregiverIds);
    for (const id of caregiverIds) {
      const p = profileMap.get(id);
      out.set(id, {
        label: profileName(p),
        sublabel: "Caregiver profile",
        href: `/admin/caregivers/${id}`,
      });
    }
  }

  return out;
}

async function fetchProfiles(
  admin: ReturnType<typeof createAdminClient>,
  ids: string[]
): Promise<
  Map<
    string,
    {
      id: string;
      full_name: string | null;
      email: string | null;
    }
  >
> {
  const map = new Map<
    string,
    {
      id: string;
      full_name: string | null;
      email: string | null;
    }
  >();
  if (ids.length === 0) return map;
  // profiles table has full_name; email lives in auth.users
  const { data: profileRows } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  const emailMap = new Map<string, string | null>();
  // Fetch emails via the admin auth API (one round-trip)
  try {
    const { data: authList } = await admin.auth.admin.listUsers({
      perPage: 200,
    });
    for (const u of authList?.users ?? []) {
      if (ids.includes(u.id)) emailMap.set(u.id, u.email ?? null);
    }
  } catch {
    // best-effort — if listUsers fails we just skip emails
  }
  for (const row of profileRows ?? []) {
    map.set(row.id, {
      id: row.id,
      full_name: row.full_name,
      email: emailMap.get(row.id) ?? null,
    });
  }
  // Ensure ids without a profile row still appear (rare)
  for (const id of ids) {
    if (!map.has(id))
      map.set(id, { id, full_name: null, email: emailMap.get(id) ?? null });
  }
  return map;
}

export default async function AdminAuditLog({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const admin = createAdminClient();
  const { data, count } = await admin
    .from("admin_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const rows = (data ?? []) as AuditRow[];
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const targetMap = await resolveTargets(rows);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Audit log</h1>
        <p className="text-sm text-slate-500 mt-1">
          Every admin write action is recorded here. Records are immutable.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No admin actions recorded yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">When</th>
                <th className="text-left px-4 py-3 font-medium">Admin</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
                <th className="text-left px-4 py-3 font-medium">Target</th>
                <th className="text-left px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const reason =
                  (r.details as { reason?: unknown } | null)?.reason ?? null;
                const override =
                  (r.details as { override?: unknown } | null)?.override ===
                  true;
                const meta = ACTION_LABELS[r.action] ?? {
                  label: r.action,
                  tone: "neutral" as const,
                };
                const toneClass =
                  TONE_CLASSES[meta.tone] ?? TONE_CLASSES.neutral;
                const target = r.target_id
                  ? targetMap.get(r.target_id)
                  : undefined;
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {fmtDateTime(r.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {r.admin_email ?? r.admin_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-xs font-medium px-2 py-0.5 rounded-md border ${toneClass}`}
                      >
                        {meta.label}
                      </span>
                      {override && (
                        <span className="ml-2 inline-block text-[10px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          Override
                        </span>
                      )}
                      <div className="mt-1 font-mono text-[10px] text-slate-400">
                        {r.action}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs">
                      {target ? (
                        <>
                          {target.href ? (
                            <Link
                              href={target.href}
                              className="font-medium text-slate-800 hover:text-slate-950 hover:underline"
                            >
                              {target.label}
                            </Link>
                          ) : (
                            <div className="font-medium text-slate-800">
                              {target.label}
                            </div>
                          )}
                          {target.sublabel && (
                            <div className="text-[11px] text-slate-500">
                              {target.sublabel}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {r.target_type && (
                            <div className="font-medium text-slate-700 capitalize">
                              {r.target_type.replace(/_/g, " ")}
                            </div>
                          )}
                          {r.target_id && (
                            <div className="font-mono text-[11px] text-slate-400">
                              {r.target_id.slice(0, 8)}…
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-md">
                      {typeof reason === "string" && reason ? (
                        <div className="mb-1">
                          <span className="text-slate-400">Reason: </span>
                          {reason}
                        </div>
                      ) : (
                        <div className="mb-1 text-slate-400 italic">
                          No reason provided
                        </div>
                      )}
                      {(() => {
                        const detailEntries = Object.entries(r.details ?? {})
                          .filter(([k]) => !DETAIL_KEYS_HIDDEN.has(k))
                          .filter(
                            ([, v]) =>
                              !(Array.isArray(v) && v.length === 0)
                          );
                        if (detailEntries.length === 0 && !r.details)
                          return null;
                        return (
                          <details className="text-[11px] mt-1">
                            <summary className="cursor-pointer text-slate-500 hover:text-slate-700 list-none flex items-center gap-1">
                              <span className="inline-block transition-transform [details[open]_&]:rotate-90">
                                ▸
                              </span>
                              More details
                            </summary>
                            {detailEntries.length > 0 && (
                              <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
                                {detailEntries.map(([k, v]) => (
                                  <div
                                    key={k}
                                    className="contents"
                                  >
                                    <dt className="text-slate-400">
                                      {humaniseKey(k)}
                                    </dt>
                                    <dd className="text-slate-700">
                                      {formatDetailValue(k, v)}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                            <details className="mt-2">
                              <summary className="cursor-pointer text-slate-400 hover:text-slate-600 text-[10px] uppercase tracking-wider">
                                Raw payload
                              </summary>
                              <pre className="mt-1 p-2 bg-slate-50 border border-slate-100 rounded overflow-x-auto whitespace-pre-wrap text-[10px]">
                                {JSON.stringify(
                                  {
                                    ...r.details,
                                    target_id: r.target_id,
                                    target_type: r.target_type,
                                  },
                                  null,
                                  2
                                )}
                              </pre>
                            </details>
                          </details>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Page {page} of {totalPages} · {count ?? 0} total
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/admin/audit-log?page=${page - 1}`}
                className="px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
              >
                ← Newer
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/admin/audit-log?page=${page + 1}`}
                className="px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
              >
                Older →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
