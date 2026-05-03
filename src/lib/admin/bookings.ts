import { createAdminClient } from "@/lib/supabase/admin";

export type BookingStatus =
  | "pending"
  | "accepted"
  | "paid"
  | "in_progress"
  | "completed"
  | "paid_out"
  | "cancelled"
  | "refunded"
  | "disputed";

export type AdminBookingRow = {
  id: string;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  hours: number;
  total_cents: number;
  platform_fee_cents: number;
  currency: "gbp" | "usd";
  service_type: string | null;
  location_city: string | null;
  location_country: "GB" | "US" | null;
  created_at: string;
  paid_at: string | null;
  shift_completed_at: string | null;
  payout_eligible_at: string | null;
  paid_out_at: string | null;

  seeker_id: string;
  seeker_name: string | null;
  seeker_email: string | null;

  caregiver_id: string;
  caregiver_name: string | null;
  caregiver_email: string | null;

  payment_status: string | null;
  payment_intent_id: string | null;
};

export type BookingsFilter = {
  status?: BookingStatus | "all";
  country?: "GB" | "US" | "all";
  currency?: "gbp" | "usd" | "all";
  q?: string; // booking id prefix or email substring
};

export async function listBookingsForAdmin(
  filter: BookingsFilter,
  page = 1,
  pageSize = 50,
): Promise<{ rows: AdminBookingRow[]; total: number }> {
  const admin = createAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = admin
    .from("bookings")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
  if (filter.country && filter.country !== "all")
    q = q.eq("location_country", filter.country);
  if (filter.currency && filter.currency !== "all")
    q = q.eq("currency", filter.currency);
  if (filter.q) {
    // booking-id prefix search; email lookup is handled client-side after row fetch.
    if (filter.q.match(/^[0-9a-f-]+$/i)) {
      q = q.ilike("id", `${filter.q}%`);
    }
  }

  const { data: bookings, count } = await q;
  if (!bookings?.length) return { rows: [], total: count ?? 0 };

  const userIds = Array.from(
    new Set(bookings.flatMap((b) => [b.seeker_id, b.caregiver_id])),
  );
  const bookingIds = bookings.map((b) => b.id);

  const [profilesRes, emailRes, paymentsRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds),
    Promise.all(userIds.map((id) => admin.auth.admin.getUserById(id))),
    admin
      .from("payments")
      .select("booking_id, status, stripe_payment_intent_id")
      .in("booking_id", bookingIds),
  ]);

  const nameById = new Map<string, string | null>();
  for (const p of profilesRes.data ?? [])
    nameById.set(p.id, p.full_name ?? null);

  const emailById = new Map<string, string | null>();
  emailRes.forEach((res, i) => {
    emailById.set(userIds[i], res.data?.user?.email ?? null);
  });

  const paymentByBooking = new Map<
    string,
    { status: string; pi: string | null }
  >();
  for (const p of paymentsRes.data ?? []) {
    paymentByBooking.set(p.booking_id, {
      status: p.status as string,
      pi: p.stripe_payment_intent_id,
    });
  }

  const rows: AdminBookingRow[] = bookings.map((b) => {
    const pmt = paymentByBooking.get(b.id);
    return {
      id: b.id,
      status: b.status as BookingStatus,
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      hours: Number(b.hours),
      total_cents: b.total_cents,
      platform_fee_cents: b.platform_fee_cents,
      currency: b.currency as "gbp" | "usd",
      service_type: b.service_type,
      location_city: b.location_city,
      location_country: (b.location_country as "GB" | "US" | null) ?? null,
      created_at: b.created_at,
      paid_at: b.paid_at,
      shift_completed_at: b.shift_completed_at,
      payout_eligible_at: b.payout_eligible_at,
      paid_out_at: b.paid_out_at,
      seeker_id: b.seeker_id,
      seeker_name: nameById.get(b.seeker_id) ?? null,
      seeker_email: emailById.get(b.seeker_id) ?? null,
      caregiver_id: b.caregiver_id,
      caregiver_name: nameById.get(b.caregiver_id) ?? null,
      caregiver_email: emailById.get(b.caregiver_id) ?? null,
      payment_status: pmt?.status ?? null,
      payment_intent_id: pmt?.pi ?? null,
    };
  });

  // Email-substring filter (post-query because emails live in auth.users)
  const filtered =
    filter.q && !filter.q.match(/^[0-9a-f-]+$/i)
      ? rows.filter(
          (r) =>
            r.seeker_email?.includes(filter.q!) ||
            r.caregiver_email?.includes(filter.q!),
        )
      : rows;

  return { rows: filtered, total: count ?? 0 };
}

export async function getBookingDetail(id: string) {
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!booking) return null;

  const [seekerProfile, caregiverProfile, seekerAuth, caregiverAuth, payment] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, country, phone")
        .eq("id", booking.seeker_id)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("id, full_name, country, phone")
        .eq("id", booking.caregiver_id)
        .maybeSingle(),
      admin.auth.admin.getUserById(booking.seeker_id),
      admin.auth.admin.getUserById(booking.caregiver_id),
      admin
        .from("payments")
        .select("*")
        .eq("booking_id", id)
        .maybeSingle(),
    ]);

  return {
    booking,
    seeker: {
      id: booking.seeker_id,
      name: seekerProfile.data?.full_name ?? null,
      email: seekerAuth.data?.user?.email ?? null,
      country: seekerProfile.data?.country ?? null,
      phone: seekerProfile.data?.phone ?? null,
    },
    caregiver: {
      id: booking.caregiver_id,
      name: caregiverProfile.data?.full_name ?? null,
      email: caregiverAuth.data?.user?.email ?? null,
      country: caregiverProfile.data?.country ?? null,
      phone: caregiverProfile.data?.phone ?? null,
    },
    payment: payment.data ?? null,
  };
}

export function fmtMoney(cents: number, currency: "gbp" | "usd") {
  const symbol = currency === "usd" ? "$" : "£";
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

export function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusTone(status: BookingStatus): {
  cls: string;
  label: string;
} {
  switch (status) {
    case "pending":
      return { cls: "bg-slate-100 text-slate-700", label: "Pending" };
    case "accepted":
      return { cls: "bg-blue-50 text-blue-700", label: "Accepted" };
    case "paid":
      return { cls: "bg-indigo-50 text-indigo-700", label: "Paid" };
    case "in_progress":
      return { cls: "bg-violet-50 text-violet-700", label: "In progress" };
    case "completed":
      return { cls: "bg-amber-50 text-amber-700", label: "Completed" };
    case "paid_out":
      return { cls: "bg-emerald-50 text-emerald-700", label: "Paid out" };
    case "cancelled":
      return { cls: "bg-slate-100 text-slate-500", label: "Cancelled" };
    case "refunded":
      return { cls: "bg-rose-50 text-rose-700", label: "Refunded" };
    case "disputed":
      return { cls: "bg-rose-100 text-rose-800", label: "Disputed" };
  }
}
