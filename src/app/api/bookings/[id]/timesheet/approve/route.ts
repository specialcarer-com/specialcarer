import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { approveTimesheet } from "@/lib/timesheet/approve";

export const dynamic = "force-dynamic";

const REASON_MIN = 5;
const REASON_MAX = 500;
const TIP_MIN_CENTS = 100;
const TIP_MAX_CENTS = 50000;

type Body = {
  typed_reason?: string;
  tip_cents?: number;
};

/**
 * POST /api/bookings/[id]/timesheet/approve
 *
 * Seeker (or org owner/admin) confirms the carer's timesheet. For seeker
 * bookings this mints supplemental manual-capture PIs for any overage /
 * overtime and an immediate-capture PI for any tip. For org bookings the
 * draft Stripe Invoice is left untouched here — the
 * `/api/cron/finalise-org-invoices` cron picks it up after the 48h window
 * and adds the overage line items.
 *
 * If `overage_requires_approval=true`, `typed_reason` (5–500 chars) is required.
 * Tips are only allowed on seeker bookings.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bookingId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json().catch(() => ({}))) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: ts } = await admin
    .from("shift_timesheets")
    .select(
      "id, booking_id, booking_source, status, overage_requires_approval",
    )
    .eq("booking_id", bookingId)
    .maybeSingle<{
      id: string;
      booking_id: string;
      booking_source: string;
      status: string;
      overage_requires_approval: boolean;
    }>();
  if (!ts) {
    return NextResponse.json({ error: "timesheet_not_found" }, { status: 404 });
  }

  // Authorisation: seeker or org owner/admin of the booking.
  const { data: booking } = await admin
    .from("bookings")
    .select("id, seeker_id, organization_id, booking_source")
    .eq("id", bookingId)
    .maybeSingle<{
      id: string;
      seeker_id: string;
      organization_id: string | null;
      booking_source: string;
    }>();
  if (!booking) {
    return NextResponse.json({ error: "booking_not_found" }, { status: 404 });
  }

  const isOrg = booking.booking_source === "org";
  let authorised = false;
  if (isOrg) {
    if (!booking.organization_id) {
      return NextResponse.json(
        { error: "org_membership_required" },
        { status: 403 },
      );
    }
    const { data: member } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", booking.organization_id)
      .eq("user_id", user.id)
      .maybeSingle<{ role: string }>();
    authorised = !!member && ["owner", "admin"].includes(member.role);
  } else {
    authorised = booking.seeker_id === user.id;
  }
  if (!authorised) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Typed reason validation when threshold breached.
  const typedReason =
    typeof body.typed_reason === "string" ? body.typed_reason.trim() : "";
  if (ts.overage_requires_approval) {
    if (typedReason.length < REASON_MIN || typedReason.length > REASON_MAX) {
      return NextResponse.json(
        {
          error: `typed_reason must be ${REASON_MIN}–${REASON_MAX} characters when overage requires approval.`,
        },
        { status: 400 },
      );
    }
  }

  // Tips only on seeker bookings.
  const tipCents = Number(body.tip_cents ?? 0);
  if (isOrg && tipCents > 0) {
    return NextResponse.json(
      { error: "tips_not_supported_on_org_bookings" },
      { status: 400 },
    );
  }
  if (tipCents > 0 && (tipCents < TIP_MIN_CENTS || tipCents > TIP_MAX_CENTS)) {
    return NextResponse.json(
      {
        error: `tip_cents must be between ${TIP_MIN_CENTS} and ${TIP_MAX_CENTS}`,
      },
      { status: 400 },
    );
  }

  const xfwd = req.headers.get("x-forwarded-for") ?? "";
  const approverIp = xfwd.split(",")[0]?.trim() || null;

  const result = await approveTimesheet(admin, {
    timesheetId: ts.id,
    approverUserId: user.id,
    approverIp,
    typedReason: typedReason || null,
    tipCents,
    auto: false,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
