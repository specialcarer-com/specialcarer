import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMyOrgMembership, getOrg } from "@/lib/org/server";
import OrgShell from "../../_components/OrgShell";
import { Card, Button, Tag } from "../../../_components/ui";
import CancelBookingButton from "./_components/CancelBookingButton";
import TimesheetSection from "./_components/TimesheetSection";
import {
  ORG_BOOKING_STATUS_LABEL,
  ORG_BOOKING_STATUS_COLOR,
  SHIFT_MODE_LABEL,
  CARE_CATEGORY_LABEL,
  type OrgBookingStatus,
  type ShiftMode,
  type CareCategory,
} from "@/lib/org/booking-types";

export const dynamic = "force-dynamic";

export default async function OrgBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/m/login?redirect=/m/org/bookings/${id}`);

  const admin = createAdminClient();
  const member = await getMyOrgMembership(admin, user.id);
  if (!member) redirect("/m/org/register/step-1");
  const org = await getOrg(admin, member.organization_id);
  if (!org) redirect("/m/org/register/step-1");

  const { data: booking } = await admin
    .from("bookings")
    .select("*")
    .eq("id", id)
    .eq("organization_id", member.organization_id)
    .maybeSingle();

  if (!booking) redirect("/m/org/bookings");

  const status = booking.status as OrgBookingStatus;
  const mode = booking.shift_mode as ShiftMode;

  // Load service user if linked
  let serviceUser: { full_name: string } | null = null;
  if (booking.service_user_id) {
    const { data: su } = await admin
      .from("service_users")
      .select("full_name")
      .eq("id", booking.service_user_id as string)
      .maybeSingle();
    serviceUser = su;
  }

  // Load invoice if exists
  let invoice: {
    hosted_invoice_url: string | null;
    invoice_pdf_url: string | null;
    amount_due_cents: number;
    status: string;
  } | null = null;
  if (booking.stripe_invoice_id) {
    const { data: inv } = await admin
      .from("org_invoices")
      .select("hosted_invoice_url, invoice_pdf_url, amount_due_cents, status")
      .eq("stripe_invoice_id", booking.stripe_invoice_id as string)
      .maybeSingle();
    invoice = inv;
  }

  const chargeCents =
    (booking.org_charge_total_cents as number | null) ??
    (booking.subtotal_cents as number);
  const canCancel = ["owner", "admin", "booker"].includes(member.role) &&
    ["pending_offer", "offered", "accepted", "in_progress"].includes(status);

  return (
    <OrgShell
      title="Booking detail"
      back="/m/org/bookings"
      status={org.verification_status}
      rejectionReason={org.rejection_reason}
    >
      <div className="space-y-4">
        {/* Status badges */}
        <div className="flex flex-wrap gap-2">
          <span
            className={`px-2.5 py-1 rounded-full text-[12px] font-semibold ${ORG_BOOKING_STATUS_COLOR[status]}`}
          >
            {ORG_BOOKING_STATUS_LABEL[status]}
          </span>
          {mode !== "single" && (
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[12px] font-semibold">
              {SHIFT_MODE_LABEL[mode]}
            </span>
          )}
        </div>

        {/* Timesheet review — visible once the carer has checked out. */}
        <TimesheetSection bookingId={id} />

        {/* Core details */}
        <Card className="p-4 space-y-3">
          {serviceUser && (
            <Row label="Service user" value={serviceUser.full_name} />
          )}
          <Row
            label="Date"
            value={new Date(booking.starts_at as string).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          />
          <Row
            label="Time"
            value={`${new Date(booking.starts_at as string).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} – ${new Date(booking.ends_at as string).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}
          />
          <Row
            label="Duration"
            value={`${Number(booking.hours).toFixed(1)} hrs`}
          />
          <Row
            label="Rate"
            value={`£${(Number(booking.hourly_rate_cents) / 100).toFixed(2)}/hr`}
          />

          {/* Sleep-in breakdown */}
          {mode === "sleep_in" && (
            <>
              <div className="border-t border-line pt-3 space-y-2">
                <Row
                  label="Active hours"
                  value={`${booking.active_hours_start ?? "—"} – ${booking.active_hours_end ?? "—"}`}
                />
                <Row
                  label="Sleep-in allowance (charged to org)"
                  value={`£${Number(booking.sleep_in_org_charge ?? 100).toFixed(2)}`}
                />
              </div>
            </>
          )}

          <div className="border-t border-line pt-3">
            <Row
              label="Total charged"
              value={`£${(chargeCents / 100).toFixed(2)}`}
              highlight
            />
          </div>

          {(booking.required_categories as string[])?.length > 0 && (
            <div>
              <p className="text-[12px] text-subheading mb-1.5">Categories</p>
              <div className="flex flex-wrap gap-1.5">
                {(booking.required_categories as CareCategory[]).map((c) => (
                  <Tag key={c} tone="neutral">
                    {CARE_CATEGORY_LABEL[c] ?? c}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Booker info */}
        {booking.booker_name_snapshot && (
          <Card className="p-4">
            <p className="text-[12px] text-subheading mb-1">Booked by</p>
            <p className="text-[14px] font-semibold text-heading">
              {booking.booker_name_snapshot as string}
            </p>
            {booking.booker_role_snapshot && (
              <p className="text-[12px] text-subheading">
                {booking.booker_role_snapshot as string}
              </p>
            )}
          </Card>
        )}

        {/* Notes */}
        {booking.notes && (
          <Card className="p-4">
            <p className="text-[12px] text-subheading mb-1">Notes</p>
            <p className="text-[13px] text-heading whitespace-pre-wrap">
              {booking.notes as string}
            </p>
          </Card>
        )}

        {/* Invoice */}
        {invoice && (
          <Card className="p-4">
            <p className="text-[12px] text-subheading mb-1">Invoice</p>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[14px] font-semibold text-heading">
                  £{(invoice.amount_due_cents / 100).toFixed(2)}{" "}
                  <span
                    className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                      invoice.status === "paid"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {invoice.status}
                  </span>
                </p>
                <p className="text-[12px] text-subheading">
                  Issued by All Care 4 U Group Ltd
                </p>
              </div>
              {invoice.hosted_invoice_url && (
                <a
                  href={invoice.hosted_invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="ghost">
                    Pay / view
                  </Button>
                </a>
              )}
            </div>
          </Card>
        )}

        {/* Cancel */}
        {canCancel && (
          <CancelBookingButton bookingId={id} startsAt={booking.starts_at as string} />
        )}
      </div>
    </OrgShell>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-[13px] text-subheading">{label}</span>
      <span
        className={`text-right font-semibold ${highlight ? "text-[16px] text-primary" : "text-[13px] text-heading"}`}
      >
        {value}
      </span>
    </div>
  );
}
