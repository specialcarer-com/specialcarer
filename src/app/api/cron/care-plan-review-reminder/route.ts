/**
 * GET /api/cron/care-plan-review-reminder
 *
 * Nightly (0 6 * * * per vercel.json) Reg-9 review reminder.
 *
 * Behaviour:
 *   1. If NEXT_PUBLIC_REG9_REVIEW_CADENCE_ENABLED is off → return
 *      `{ ok: true, skipped: 'flag_off' }` immediately (0 DB work).
 *   2. Mark any `status='due'` row with `scheduled_for < today` as
 *      `status='overdue'`.
 *   3. Emit an in-app notification + email to the seeker for reviews
 *      whose `scheduled_for` equals today + 14 days OR today + 1 day,
 *      still `status='due'`. Idempotent via `last_reminded_at` on the
 *      row — we only emit if the column is null or older than today.
 *
 * Uses the service-role client (bypasses RLS).
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron/auth";
import { isReg9ReviewCadenceEnabled } from "@/lib/care-plan/flag";
import { REVIEW_REMINDER_LEAD_DAYS } from "@/lib/care-plan/reviews";

// NOTE: smtp / notifications / supabase admin are imported lazily inside
// GET() *after* the flag check so the off-state code path never pulls in
// `server-only`-tagged modules — keeps the flag-off unit test runnable
// under node:test without a Next runtime.

export const dynamic = "force-dynamic";

type ReviewRow = {
  id: string;
  care_plan_id: string;
  scheduled_for: string;
  status: string;
  last_reminded_at: string | null;
};

type PlanRow = { id: string; booking_id: string };
type BookingRow = { id: string; seeker_id: string };

function ymdOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  if (!isReg9ReviewCadenceEnabled()) {
    return NextResponse.json({ ok: true, skipped: "flag_off" });
  }

  // Lazy-load the heavy deps only when the flag is on.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { sendEmail } = await import("@/lib/email/smtp");
  const { createNotification } = await import("@/lib/notifications/server");

  const admin = createAdminClient();
  const today = todayYmd();

  // Step 1 — mark overdue.
  const { data: overdueRows, error: overdueErr } = await admin
    .from("care_plan_reviews")
    .update({ status: "overdue", updated_at: new Date().toISOString() })
    .lt("scheduled_for", today)
    .eq("status", "due")
    .select("id");
  if (overdueErr) {
    console.error("[cron.care-plan-review-reminder] overdue update failed", overdueErr);
  }
  const overdueCount = overdueRows?.length ?? 0;

  // Step 2 — find upcoming reviews to remind about.
  const leadYmds = REVIEW_REMINDER_LEAD_DAYS.map((d) => ymdOffset(d));
  const { data: dueRows, error: dueErr } = await admin
    .from("care_plan_reviews")
    .select("id, care_plan_id, scheduled_for, status, last_reminded_at")
    .in("scheduled_for", leadYmds)
    .eq("status", "due");
  if (dueErr) {
    console.error("[cron.care-plan-review-reminder] due fetch failed", dueErr);
    return NextResponse.json(
      { ok: false, error: dueErr.message, overdueCount },
      { status: 500 },
    );
  }
  const candidates = (dueRows ?? []) as ReviewRow[];

  // Idempotency: don't re-remind if last_reminded_at is today already.
  const toRemind = candidates.filter(
    (r) => !r.last_reminded_at || r.last_reminded_at.slice(0, 10) !== today,
  );

  let notified = 0;
  let emailed = 0;
  const errors: string[] = [];

  if (toRemind.length > 0) {
    const planIds = Array.from(new Set(toRemind.map((r) => r.care_plan_id)));
    const { data: plans } = await admin
      .from("care_plans")
      .select("id, booking_id")
      .in("id", planIds);
    const planById = new Map<string, PlanRow>();
    for (const p of (plans ?? []) as PlanRow[]) planById.set(p.id, p);

    const bookingIds = Array.from(
      new Set((plans ?? []).map((p: PlanRow) => p.booking_id)),
    );
    const { data: bookings } = await admin
      .from("bookings")
      .select("id, seeker_id")
      .in("id", bookingIds);
    const bookingById = new Map<string, BookingRow>();
    for (const b of (bookings ?? []) as BookingRow[]) bookingById.set(b.id, b);

    for (const review of toRemind) {
      const plan = planById.get(review.care_plan_id);
      const booking = plan ? bookingById.get(plan.booking_id) : null;
      if (!booking) {
        errors.push(`review ${review.id}: missing booking`);
        continue;
      }

      try {
        await createNotification({
          user_id: booking.seeker_id,
          type: "care_plan.review_due",
          title: "Care-plan review coming up",
          body: `A Reg-9 care-plan review is scheduled for ${review.scheduled_for}. Complete it in Settings → Care-plan reviews.`,
          deeplink: `/settings/care-plan/reviews/${review.id}`,
          payload: {
            review_id: review.id,
            care_plan_id: review.care_plan_id,
            scheduled_for: review.scheduled_for,
          },
        });
        notified++;
      } catch (e) {
        errors.push(
          `notify ${review.id}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }

      try {
        const { data: userData } = await admin.auth.admin.getUserById(
          booking.seeker_id,
        );
        const email = userData.user?.email ?? null;
        if (email) {
          const subject = "Your care-plan review is coming up";
          const body =
            `A care-plan review is scheduled for ${review.scheduled_for}. ` +
            `Please open Settings → Care-plan reviews on SpecialCarer to complete it.`;
          const res = await sendEmail({
            to: email,
            subject,
            text: body,
            html: `<p>${body}</p>`,
          });
          if (res.ok) emailed++;
          else errors.push(`email ${review.id}: ${res.error}`);
        }
      } catch (e) {
        errors.push(
          `email ${review.id}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }

      const { error: markErr } = await admin
        .from("care_plan_reviews")
        .update({ last_reminded_at: new Date().toISOString() })
        .eq("id", review.id);
      if (markErr) {
        errors.push(`mark-reminded ${review.id}: ${markErr.message}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    overdueCount,
    remindedCandidates: toRemind.length,
    notified,
    emailed,
    errors,
  });
}
