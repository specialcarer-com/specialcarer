import { createAdminClient } from "@/lib/supabase/admin";

// -------------------- Reviews queue --------------------

export type AdminReviewRow = {
  id: string;
  booking_id: string;
  reviewer_id: string;
  caregiver_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  hidden_at: string | null;
  hidden_reason: string | null;

  reviewer_name: string | null;
  reviewer_email: string | null;
  caregiver_name: string | null;
};

export type ReviewsFilter = "all" | "visible" | "hidden" | "low_rating";

export async function listReviewsForAdmin(
  filter: ReviewsFilter,
): Promise<AdminReviewRow[]> {
  const admin = createAdminClient();
  let q = admin
    .from("reviews")
    .select(
      "id, booking_id, reviewer_id, caregiver_id, rating, body, created_at, hidden_at, hidden_reason",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (filter === "visible") q = q.is("hidden_at", null);
  if (filter === "hidden") q = q.not("hidden_at", "is", null);
  if (filter === "low_rating") q = q.lte("rating", 2).is("hidden_at", null);

  const { data: reviews } = await q;
  if (!reviews?.length) return [];

  const userIds = Array.from(
    new Set(reviews.flatMap((r) => [r.reviewer_id, r.caregiver_id])),
  );
  const [profilesRes, emailRes] = await Promise.all([
    admin.from("profiles").select("id, full_name").in("id", userIds),
    Promise.all(userIds.map((id) => admin.auth.admin.getUserById(id))),
  ]);
  const nameById = new Map<string, string | null>();
  for (const p of profilesRes.data ?? [])
    nameById.set(p.id, p.full_name ?? null);
  const emailById = new Map<string, string | null>();
  emailRes.forEach((res, i) => {
    emailById.set(userIds[i], res.data?.user?.email ?? null);
  });

  return reviews.map((r) => ({
    id: r.id,
    booking_id: r.booking_id,
    reviewer_id: r.reviewer_id,
    caregiver_id: r.caregiver_id,
    rating: r.rating as number,
    body: r.body,
    created_at: r.created_at as string,
    hidden_at: r.hidden_at as string | null,
    hidden_reason: r.hidden_reason,
    reviewer_name: nameById.get(r.reviewer_id) ?? null,
    reviewer_email: emailById.get(r.reviewer_id) ?? null,
    caregiver_name: nameById.get(r.caregiver_id) ?? null,
  }));
}

// -------------------- Disputes queue --------------------

export type AdminDisputeRow = {
  id: string;
  status: string;
  total_cents: number;
  currency: "gbp" | "usd";
  starts_at: string;
  location_country: "GB" | "US" | null;
  seeker_name: string | null;
  caregiver_name: string | null;
  payment_intent_id: string | null;
  payment_status: string | null;
};

export async function listDisputesForAdmin(): Promise<AdminDisputeRow[]> {
  const admin = createAdminClient();
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, status, total_cents, currency, starts_at, location_country, seeker_id, caregiver_id",
    )
    .eq("status", "disputed")
    .order("starts_at", { ascending: false })
    .limit(100);
  if (!bookings?.length) return [];

  const userIds = Array.from(
    new Set(bookings.flatMap((b) => [b.seeker_id, b.caregiver_id])),
  );
  const bookingIds = bookings.map((b) => b.id);

  const [profilesRes, paymentsRes] = await Promise.all([
    admin.from("profiles").select("id, full_name").in("id", userIds),
    admin
      .from("payments")
      .select("booking_id, status, stripe_payment_intent_id")
      .in("booking_id", bookingIds),
  ]);
  const nameById = new Map<string, string | null>();
  for (const p of profilesRes.data ?? [])
    nameById.set(p.id, p.full_name ?? null);
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

  return bookings.map((b) => {
    const pmt = paymentByBooking.get(b.id);
    return {
      id: b.id,
      status: b.status as string,
      total_cents: b.total_cents as number,
      currency: b.currency as "gbp" | "usd",
      starts_at: b.starts_at as string,
      location_country: (b.location_country as "GB" | "US" | null) ?? null,
      seeker_name: nameById.get(b.seeker_id) ?? null,
      caregiver_name: nameById.get(b.caregiver_id) ?? null,
      payment_intent_id: pmt?.pi ?? null,
      payment_status: pmt?.status ?? null,
    };
  });
}

// -------------------- KYC escalations queue --------------------

export type AdminKycRow = {
  id: string;
  user_id: string;
  vendor: string;
  check_type: string;
  status: string;
  result_summary: string | null;
  issued_at: string | null;
  expires_at: string | null;
  vendor_check_id: string | null;
  user_name: string | null;
  user_email: string | null;
  // Existing decision (if any)
  decision: "approved" | "rejected" | "requested_more_info" | null;
  decided_at: string | null;
  decided_by_email: string | null;
  decision_notes: string | null;
};

export type KycFilter = "open" | "all" | "decided";

export async function listKycEscalations(
  filter: KycFilter,
): Promise<AdminKycRow[]> {
  const admin = createAdminClient();

  // Source: background_checks rows in {consider, failed}
  const { data: checks } = await admin
    .from("background_checks")
    .select(
      "id, user_id, vendor, check_type, status, result_summary, issued_at, expires_at, vendor_check_id, updated_at",
    )
    .in("status", ["consider", "failed"])
    .order("updated_at", { ascending: false })
    .limit(200);
  if (!checks?.length) return [];

  const ids = checks.map((c) => c.id);
  const userIds = Array.from(new Set(checks.map((c) => c.user_id)));

  const [decisionsRes, profilesRes, emailRes] = await Promise.all([
    admin
      .from("kyc_escalations")
      .select(
        "background_check_id, decision, decided_by_email, notes, created_at",
      )
      .in("background_check_id", ids),
    admin.from("profiles").select("id, full_name").in("id", userIds),
    Promise.all(userIds.map((id) => admin.auth.admin.getUserById(id))),
  ]);

  const decisionByCheck = new Map<
    string,
    {
      decision: "approved" | "rejected" | "requested_more_info";
      decided_at: string;
      decided_by_email: string | null;
      notes: string | null;
    }
  >();
  for (const d of decisionsRes.data ?? []) {
    decisionByCheck.set(d.background_check_id, {
      decision: d.decision as "approved" | "rejected" | "requested_more_info",
      decided_at: d.created_at as string,
      decided_by_email: d.decided_by_email,
      notes: d.notes,
    });
  }
  const nameById = new Map<string, string | null>();
  for (const p of profilesRes.data ?? [])
    nameById.set(p.id, p.full_name ?? null);
  const emailById = new Map<string, string | null>();
  emailRes.forEach((res, i) => {
    emailById.set(userIds[i], res.data?.user?.email ?? null);
  });

  let rows: AdminKycRow[] = checks.map((c) => {
    const dec = decisionByCheck.get(c.id);
    return {
      id: c.id,
      user_id: c.user_id,
      vendor: c.vendor as string,
      check_type: c.check_type as string,
      status: c.status as string,
      result_summary: c.result_summary,
      issued_at: c.issued_at as string | null,
      expires_at: c.expires_at as string | null,
      vendor_check_id: c.vendor_check_id,
      user_name: nameById.get(c.user_id) ?? null,
      user_email: emailById.get(c.user_id) ?? null,
      decision: dec?.decision ?? null,
      decided_at: dec?.decided_at ?? null,
      decided_by_email: dec?.decided_by_email ?? null,
      decision_notes: dec?.notes ?? null,
    };
  });

  if (filter === "open") rows = rows.filter((r) => r.decision === null);
  if (filter === "decided") rows = rows.filter((r) => r.decision !== null);

  return rows;
}

// -------------------- Hub counts --------------------

export async function getTrustSafetyCounts() {
  const admin = createAdminClient();
  const [
    reviewsLow,
    disputes,
    kycOpen,
    sosOpen,
    safetyOpen,
    leaveOpen,
    forumOpen,
  ] = await Promise.all([
    admin
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .lte("rating", 2)
      .is("hidden_at", null),
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("status", "disputed"),
    admin
      .from("background_checks")
      .select("id", { count: "exact", head: true })
      .in("status", ["consider", "failed"]),
    admin
      .from("sos_alerts")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    admin
      .from("safety_reports")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "triaging", "escalated"]),
    admin
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    admin
      .from("forum_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  // KYC open = bg_checks in consider/failed that have NO decision yet.
  // Approximation: count all consider/failed; the actual list filters.
  return {
    reviewsLowRating: reviewsLow.count ?? 0,
    disputes: disputes.count ?? 0,
    kycEscalations: kycOpen.count ?? 0,
    sosOpen: sosOpen.count ?? 0,
    safetyReportsOpen: safetyOpen.count ?? 0,
    leaveRequestsOpen: leaveOpen.count ?? 0,
    forumReportsOpen: forumOpen.count ?? 0,
  };
}

// -------------------- SOS queue --------------------

export type AdminSosRow = {
  id: string;
  user_id: string;
  booking_id: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  note: string | null;
  status: "open" | "acknowledged" | "resolved";
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
};

export type SosFilter = "open" | "all";

export async function listSosForAdmin(
  filter: SosFilter = "open",
): Promise<AdminSosRow[]> {
  const admin = createAdminClient();
  let q = admin
    .from("sos_alerts")
    .select(
      "id, user_id, booking_id, lat, lng, accuracy_m, note, status, acknowledged_by, acknowledged_at, resolved_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "open") q = q.eq("status", "open");

  const { data: rows } = await q;
  if (!rows?.length) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id as string)));
  const [profilesRes, emailRes] = await Promise.all([
    admin.from("profiles").select("id, full_name").in("id", userIds),
    Promise.all(userIds.map((id) => admin.auth.admin.getUserById(id))),
  ]);
  const nameById = new Map<string, string | null>();
  for (const p of profilesRes.data ?? [])
    nameById.set(p.id, p.full_name ?? null);
  const emailById = new Map<string, string | null>();
  emailRes.forEach((res, i) => {
    emailById.set(userIds[i], res.data?.user?.email ?? null);
  });

  return rows.map((r) => ({
    id: r.id as string,
    user_id: r.user_id as string,
    booking_id: r.booking_id as string | null,
    lat: r.lat as number | null,
    lng: r.lng as number | null,
    accuracy_m: r.accuracy_m as number | null,
    note: r.note as string | null,
    status: r.status as "open" | "acknowledged" | "resolved",
    acknowledged_by: r.acknowledged_by as string | null,
    acknowledged_at: r.acknowledged_at as string | null,
    resolved_at: r.resolved_at as string | null,
    created_at: r.created_at as string,
    user_name: nameById.get(r.user_id as string) ?? null,
    user_email: emailById.get(r.user_id as string) ?? null,
  }));
}
