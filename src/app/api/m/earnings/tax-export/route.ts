import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Country = "GB" | "US";

function taxYearWindow(country: Country, year: number): {
  start: Date;
  end: Date;
} {
  if (country === "GB") {
    // UK tax year: 6 April → 5 April next year.
    return {
      start: new Date(Date.UTC(year, 3, 6, 0, 0, 0)), // 6 Apr
      end: new Date(Date.UTC(year + 1, 3, 6, 0, 0, 0)), // exclusive
    };
  }
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

function csvEscape(s: unknown): string {
  if (s == null) return "";
  const str = String(s);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * GET /api/m/earnings/tax-export?year=2025&format=csv
 *
 * Per-booking CSV of carer take-home for the requested tax year.
 * No external PDF dep — clients that need a printable view can render
 * the data themselves; we hint `pdf_available: false` on the JSON
 * response when format=pdf.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const yearParam = Number(url.searchParams.get("year") ?? new Date().getUTCFullYear());
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const countryParam = url.searchParams.get("country");

  const admin = createAdminClient();
  const { data: prof } = await admin
    .from("caregiver_profiles")
    .select("country")
    .eq("user_id", user.id)
    .maybeSingle<{ country: string | null }>();
  const country: Country =
    countryParam === "US" || countryParam === "GB"
      ? countryParam
      : prof?.country === "US"
        ? "US"
        : "GB";

  const { start, end } = taxYearWindow(country, yearParam);

  const [bookingsRes, tipsRes] = await Promise.all([
    admin
      .from("bookings")
      .select(
        "id, shift_completed_at, hours, hourly_rate_cents, subtotal_cents, platform_fee_cents, currency, location_country, status",
      )
      .eq("caregiver_id", user.id)
      .in("status", ["completed", "paid_out"])
      .gte("shift_completed_at", start.toISOString())
      .lt("shift_completed_at", end.toISOString())
      .order("shift_completed_at", { ascending: true }),
    admin
      .from("tips")
      .select("id, succeeded_at, amount_cents, currency")
      .eq("caregiver_id", user.id)
      .eq("status", "succeeded")
      .gte("succeeded_at", start.toISOString())
      .lt("succeeded_at", end.toISOString())
      .order("succeeded_at", { ascending: true }),
  ]);

  type B = {
    id: string;
    shift_completed_at: string | null;
    hours: number;
    hourly_rate_cents: number;
    subtotal_cents: number;
    platform_fee_cents: number;
    currency: string;
    location_country: string | null;
  };
  type T = {
    id: string;
    succeeded_at: string | null;
    amount_cents: number;
    currency: string;
  };
  const bookings = (bookingsRes.data ?? []) as B[];
  const tips = (tipsRes.data ?? []) as T[];

  const totals = {
    gross_subtotal_cents: bookings.reduce(
      (s, r) => s + (r.subtotal_cents ?? 0),
      0,
    ),
    platform_fee_cents: bookings.reduce(
      (s, r) => s + (r.platform_fee_cents ?? 0),
      0,
    ),
    tips_cents: tips.reduce((s, r) => s + (r.amount_cents ?? 0), 0),
    booking_count: bookings.length,
  };

  if (format === "pdf") {
    return NextResponse.json({
      pdf_available: false,
      message:
        "Built-in PDF generation is not enabled. Download the CSV and use your accounting tool — links to gov.uk / IRS guidance are on the page.",
      year: yearParam,
      country,
      window: { start: start.toISOString(), end: end.toISOString() },
      totals,
    });
  }

  // CSV.
  const header =
    "type,date,hours,hourly_rate_cents,gross_cents,platform_fee_cents,net_cents,currency,country";
  const lines: string[] = [header];
  for (const b of bookings) {
    const subtotal = b.subtotal_cents ?? 0;
    const fee = b.platform_fee_cents ?? 0;
    const net = subtotal - fee;
    lines.push(
      [
        "booking",
        b.shift_completed_at ?? "",
        b.hours ?? "",
        b.hourly_rate_cents ?? "",
        subtotal,
        fee,
        net,
        b.currency ?? "",
        b.location_country ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  for (const t of tips) {
    lines.push(
      [
        "tip",
        t.succeeded_at ?? "",
        "",
        "",
        t.amount_cents ?? 0,
        0,
        t.amount_cents ?? 0,
        (t.currency ?? "").toLowerCase(),
        "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  // Summary row for quick totals.
  lines.push(
    [
      "TOTALS",
      `${start.toISOString().slice(0, 10)}…${end.toISOString().slice(0, 10)}`,
      "",
      "",
      totals.gross_subtotal_cents,
      totals.platform_fee_cents,
      totals.gross_subtotal_cents - totals.platform_fee_cents + totals.tips_cents,
      "",
      country,
    ]
      .map(csvEscape)
      .join(","),
  );

  const csv = lines.join("\n") + "\n";
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="specialcarer-earnings-${country}-${yearParam}.csv"`,
    },
  });
}
