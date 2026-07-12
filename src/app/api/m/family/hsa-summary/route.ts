import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  handleHsaSummary,
  type HsaSummaryClient,
  type HsaSummaryPaymentRow,
} from "@/lib/hsa/summary-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/m/family/hsa-summary?year=YYYY (gap 33)
 *
 * Returns the caller's HSA/FSA-eligible payments for the year (default current).
 * US-only: non-USD seekers get { enabled: false }. Ownership is implicit — we
 * only ever read payments whose booking.seeker_id is the caller.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = new URL(req.url);
  const yearRaw = url.searchParams.get("year");
  const year = yearRaw ? Number.parseInt(yearRaw, 10) : undefined;
  const includeAll = url.searchParams.get("all") === "1";

  const client: HsaSummaryClient = {
    async isUsSeeker(userId) {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("bookings")
        .select("id")
        .eq("seeker_id", userId)
        .eq("currency", "usd")
        .limit(1);
      if (error) return { data: false, error };
      return { data: (data?.length ?? 0) > 0, error: null };
    },
    async listEligiblePayments({ userId, yearStart, yearEnd, eligibleOnly }) {
      const admin = createAdminClient();
      let query = admin
        .from("payments")
        .select(
          "id, booking_id, amount_cents, created_at, hsa_eligible, status, bookings!inner(seeker_id, caregiver_id)",
        )
        .eq("bookings.seeker_id", userId)
        .eq("status", "succeeded")
        .gte("created_at", yearStart)
        .lt("created_at", yearEnd)
        .order("created_at", { ascending: true });
      if (eligibleOnly) query = query.eq("hsa_eligible", true);
      const { data, error } = await query;
      if (error) return { data: null, error };

      type Joined = {
        id: string;
        booking_id: string;
        amount_cents: number;
        created_at: string | null;
        hsa_eligible: boolean;
        bookings:
          | { seeker_id: string; caregiver_id: string }
          | { seeker_id: string; caregiver_id: string }[];
      };
      const rows = (data ?? []) as Joined[];

      // Resolve caregiver names in one batch.
      const carerIds = Array.from(
        new Set(
          rows.map((r) => {
            const b = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
            return b?.caregiver_id;
          }),
        ),
      ).filter((x): x is string => !!x);

      const nameById = new Map<string, string | null>();
      if (carerIds.length > 0) {
        const { data: profs } = await admin
          .from("profiles")
          .select("id, full_name")
          .in("id", carerIds);
        for (const p of (profs ?? []) as {
          id: string;
          full_name: string | null;
        }[]) {
          nameById.set(p.id, p.full_name);
        }
      }

      const out: HsaSummaryPaymentRow[] = rows.map((r) => {
        const b = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
        return {
          id: r.id,
          booking_id: r.booking_id,
          amount_cents: r.amount_cents,
          paid_at: r.created_at,
          hsa_eligible: r.hsa_eligible,
          caregiver_name: b?.caregiver_id
            ? nameById.get(b.caregiver_id) ?? null
            : null,
        };
      });
      return { data: out, error: null };
    },
  };

  return handleHsaSummary({
    user_id: user?.id ?? null,
    year,
    includeAll,
    client,
  });
}
