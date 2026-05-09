import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../_components/OrgShell";
import { Card, Button, Tag } from "../../_components/ui";
import {
  ORG_BOOKING_STATUS_LABEL,
  ORG_BOOKING_STATUS_COLOR,
  SHIFT_MODE_LABEL,
  type OrgBookingStatus,
  type ShiftMode,
} from "@/lib/org/booking-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings — SpecialCarer" };

type SearchParams = {
  status?: string;
  service_user_id?: string;
  from?: string;
  to?: string;
  page?: string;
};

export default async function OrgBookingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/org/bookings");

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  let q = admin
    .from("bookings")
    .select(
      `id, status, shift_mode, starts_at, ends_at, hours, hourly_rate_cents,
       org_charge_total_cents, subtotal_cents, currency,
       service_user_id, caregiver_id, booker_name_snapshot,
       invoiced_at, stripe_invoice_id, created_at, notes,
       sleep_in_org_charge, is_recurring_parent`,
      { count: "exact" }
    )
    .eq("organization_id", member.organization_id)
    .eq("booking_source", "org")
    .is("parent_booking_id", null) // show parents + standalone only
    .order("starts_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (sp.status) q = q.eq("status", sp.status);
  if (sp.service_user_id) q = q.eq("service_user_id", sp.service_user_id);
  if (sp.from) q = q.gte("starts_at", sp.from);
  if (sp.to) q = q.lte("starts_at", sp.to);

  const { data: bookings, count } = await q;

  // Load service users for filter + display
  const { data: serviceUsers } = await admin
    .from("service_users")
    .select("id, full_name")
    .eq("organization_id", member.organization_id)
    .is("archived_at", null)
    .order("full_name");

  const canBook =
    org.booking_enabled &&
    ["owner", "admin", "booker"].includes(member.role);

  const totalPages = Math.ceil((count ?? 0) / limit);

  return (
    <OrgShell
      title="Bookings"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-subheading">
            {count ?? 0} booking{count !== 1 ? "s" : ""}
          </p>
          {canBook && (
            <Link href="/m/org/bookings/new">
              <Button size="sm">+ New booking</Button>
            </Link>
          )}
        </div>

        {/* Filters */}
        <FilterBar
          currentStatus={sp.status}
          currentServiceUserId={sp.service_user_id}
          serviceUsers={serviceUsers ?? []}
        />

        {/* Empty state */}
        {!bookings?.length && (
          <Card className="p-6 text-center">
            {org.verification_status !== "verified" ? (
              <>
                <p className="text-[14px] font-bold text-heading">
                  Booking opens once verified
                </p>
                <p className="mt-1 text-[12px] text-subheading">
                  We review your documents before enabling bookings — this
                  protects everyone, especially vulnerable service users.
                  Usually 2 business days.
                </p>
              </>
            ) : (
              <>
                <p className="text-[14px] font-bold text-heading">
                  No bookings yet
                </p>
                <p className="mt-1 text-[12px] text-subheading mb-4">
                  Create your first booking to start matching with verified
                  carers.
                </p>
                {canBook && (
                  <Link href="/m/org/bookings/new">
                    <Button variant="ghost">Create your first booking</Button>
                  </Link>
                )}
              </>
            )}
          </Card>
        )}

        {/* Booking cards */}
        {bookings?.map((b) => {
          const status = b.status as OrgBookingStatus;
          const mode = b.shift_mode as ShiftMode;
          const chargeCents =
            (b.org_charge_total_cents as number | null) ?? (b.subtotal_cents as number);
          const invoiceUrl = null; // hosted_invoice_url loaded lazily

          return (
            <Link key={b.id} href={`/m/org/bookings/${b.id}`}>
              <Card className="p-4 hover:border-primary/40 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Status + mode badges */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${ORG_BOOKING_STATUS_COLOR[status]}`}
                      >
                        {ORG_BOOKING_STATUS_LABEL[status] ?? status}
                      </span>
                      {mode !== "single" && (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
                          {SHIFT_MODE_LABEL[mode]}
                        </span>
                      )}
                      {b.is_recurring_parent && (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[11px] font-semibold">
                          4-week pattern
                        </span>
                      )}
                    </div>

                    {/* Date */}
                    <p className="text-[14px] font-semibold text-heading">
                      {new Date(b.starts_at as string).toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    <p className="text-[12px] text-subheading">
                      {new Date(b.starts_at as string).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" – "}
                      {new Date(b.ends_at as string).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>

                    {/* Booker */}
                    {b.booker_name_snapshot && (
                      <p className="text-[12px] text-subheading mt-0.5">
                        Booked by {b.booker_name_snapshot as string}
                      </p>
                    )}
                  </div>

                  {/* Charge amount — ONLY org_charge_total shown to org */}
                  <div className="text-right shrink-0">
                    <p className="text-[15px] font-bold text-heading">
                      £{(chargeCents / 100).toFixed(2)}
                    </p>
                    {status === "invoiced" && b.stripe_invoice_id && (
                      <span className="text-[11px] text-purple-700 font-semibold">
                        Invoice sent
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 pt-2">
            {page > 1 && (
              <Link
                href={`/m/org/bookings?${new URLSearchParams({ ...sp, page: String(page - 1) })}`}
              >
                <Button size="sm" variant="outline">
                  Previous
                </Button>
              </Link>
            )}
            <span className="text-[13px] text-subheading self-center">
              Page {page} of {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`/m/org/bookings?${new URLSearchParams({ ...sp, page: String(page + 1) })}`}
              >
                <Button size="sm" variant="outline">
                  Next
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </OrgShell>
  );
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({
  currentStatus,
  currentServiceUserId,
  serviceUsers,
}: {
  currentStatus?: string;
  currentServiceUserId?: string;
  serviceUsers: { id: string; full_name: string }[];
}) {
  const statuses = [
    "pending_offer",
    "offered",
    "accepted",
    "in_progress",
    "completed",
    "invoiced",
    "cancelled",
  ] as OrgBookingStatus[];

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-2 min-w-max">
        <a
          href="/m/org/bookings"
          className={`px-3 py-1.5 rounded-pill text-[12px] font-semibold border transition whitespace-nowrap
            ${!currentStatus ? "bg-primary text-white border-primary" : "bg-white text-heading border-line"}`}
        >
          All
        </a>
        {statuses.map((s) => (
          <a
            key={s}
            href={`/m/org/bookings?status=${s}`}
            className={`px-3 py-1.5 rounded-pill text-[12px] font-semibold border transition whitespace-nowrap
              ${currentStatus === s ? "bg-primary text-white border-primary" : "bg-white text-heading border-line"}`}
          >
            {ORG_BOOKING_STATUS_LABEL[s]}
          </a>
        ))}
      </div>
    </div>
  );
}
