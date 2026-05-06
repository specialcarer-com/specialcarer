/**
 * Active-job task checklist for a single booking.
 *
 *   GET    /api/bookings/[id]/checklist           → current items
 *   PUT    /api/bookings/[id]/checklist           → replace whole list
 *
 * Auth: must be the seeker or carer on the booking, or an active family
 * member of the seeker. RLS on `bookings` already enforces this for
 * SELECT/UPDATE — we additionally re-check role for clearer 403s.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sanitiseChecklist,
  CHECKLIST_MAX_ITEMS,
  type ChecklistItem,
} from "@/lib/checklist/types";

export const dynamic = "force-dynamic";

type BookingRow = {
  id: string;
  seeker_id: string;
  caregiver_id: string | null;
  task_checklist: unknown;
};

async function loadBookingForUser(
  bookingId: string,
): Promise<
  | { ok: true; booking: BookingRow; role: "seeker" | "caregiver" | "family" }
  | { ok: false; status: number; error: string }
> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Not authenticated" };
  }

  const { data: booking } = await client
    .from("bookings")
    .select("id, seeker_id, caregiver_id, task_checklist")
    .eq("id", bookingId)
    .maybeSingle<BookingRow>();
  if (!booking) {
    return { ok: false, status: 404, error: "Booking not found" };
  }

  let role: "seeker" | "caregiver" | "family" | null = null;
  if (booking.seeker_id === user.id) role = "seeker";
  else if (booking.caregiver_id === user.id) role = "caregiver";
  else {
    // Active family member of the seeker? Same two-step pattern used by
    // src/lib/tracking/server.ts.
    const { data: fams } = await client
      .from("family_members")
      .select("family_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(50);
    const familyIds = (fams ?? []).map((f) => f.family_id);
    if (familyIds.length) {
      const { count } = await client
        .from("families")
        .select("id", { count: "exact", head: true })
        .eq("primary_user_id", booking.seeker_id)
        .in("id", familyIds);
      if ((count ?? 0) > 0) role = "family";
    }
  }

  if (!role) {
    return { ok: false, status: 403, error: "Not part of this booking" };
  }
  return { ok: true, booking, role };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const r = await loadBookingForUser(id);
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  const items = sanitiseChecklist(r.booking.task_checklist);
  return NextResponse.json({ items, role: r.role });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const r = await loadBookingForUser(id);
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.status });
  }
  // Family-side viewers can read but not edit the checklist for now —
  // keeps the audit trail simple (carer/seeker are the parties).
  if (r.role === "family") {
    return NextResponse.json(
      { error: "Family viewers can't edit the checklist." },
      { status: 403 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  const items = sanitiseChecklist(
    (payload as { items?: unknown })?.items,
  );
  if (items.length > CHECKLIST_MAX_ITEMS) items.length = CHECKLIST_MAX_ITEMS;

  // Use admin client so we can update *only* task_checklist on this row
  // without granting a broad UPDATE policy on `bookings`. Authorisation
  // already happened via loadBookingForUser() above.
  const admin = createAdminClient();
  const { error } = await admin
    .from("bookings")
    .update({ task_checklist: items as unknown as ChecklistItem[] })
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ items });
}
