import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar, Tag, IconChevronRight } from "../../_components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices — SpecialCarer" };

type InvoicePill = { label: string; tone: "green" | "amber" | "red" };

// Map booking_status enum values to a consumer-facing invoice pill.
// Compared as strings (not the DB enum) so unknown/legacy values degrade gracefully.
const PAID_STATUSES = new Set(["paid", "paid_out", "in_progress", "completed", "confirmed"]);
const FAILED_STATUSES = new Set(["payment_failed", "cancelled", "refunded", "disputed"]);

function statusToPill(status: string | null): InvoicePill {
  if (status === "refunded") return { label: "Refunded", tone: "red" };
  if (status && PAID_STATUSES.has(status)) return { label: "Paid", tone: "green" };
  if (status && FAILED_STATUSES.has(status)) return { label: "Failed", tone: "red" };
  return { label: "Pending", tone: "amber" };
}

function invoiceNumber(id: string, createdAt: string | null): string {
  const year = createdAt ? new Date(createdAt).getUTCFullYear() : new Date().getUTCFullYear();
  return `SC-${year}-${id.slice(0, 4).toUpperCase()}`;
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatHours(hours: number | null): string {
  if (hours == null) return "";
  const n = Number(hours);
  const rounded = Number.isInteger(n) ? n : Math.round(n * 100) / 100;
  return ` · ${rounded} hr${rounded === 1 ? "" : "s"}`;
}

type BookingRow = {
  id: string;
  status: string | null;
  total_cents: number | null;
  currency: string | null;
  hours: number | null;
  service_type: string | null;
  created_at: string | null;
  paid_out_at: string | null;
  caregiver_id: string | null;
};

export default async function InvoicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/m/login?redirect=/m/profile/invoices");

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select(
      "id, status, total_cents, currency, hours, service_type, created_at, paid_out_at, caregiver_id"
    )
    .or(`seeker_id.eq.${user.id},designated_payer_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(50);

  const bookings = (bookingsData ?? []) as BookingRow[];

  // bookings.caregiver_id references auth.users, so there is no direct FK to
  // caregiver_profiles to embed. Resolve names with a separate lookup.
  const caregiverIds = [...new Set(bookings.map((b) => b.caregiver_id).filter(Boolean))] as string[];
  const namesById = new Map<string, string>();
  if (caregiverIds.length > 0) {
    const { data: profiles } = await supabase
      .from("caregiver_profiles")
      .select("user_id, display_name")
      .in("user_id", caregiverIds);
    for (const p of (profiles ?? []) as { user_id: string; display_name: string | null }[]) {
      if (p.display_name) namesById.set(p.user_id, p.display_name);
    }
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-8">
      <TopBar title="Invoices" back="/m/profile" />

      {bookings.length === 0 ? (
        <div className="mt-2 px-5">
          <div className="rounded-card bg-muted p-6 text-center">
            <p className="text-[13.5px] text-subheading">
              No invoices yet. Once you book a carer, your receipts will appear here.
            </p>
          </div>
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-3 px-5">
          {bookings.map((b) => {
            const pill = statusToPill(b.status);
            const carerName = (b.caregiver_id && namesById.get(b.caregiver_id)) || "Carer";
            const amount = ((b.total_cents ?? 0) / 100).toFixed(2);
            const date = b.created_at ? dateFormatter.format(new Date(b.created_at)) : "";
            return (
              <li key={b.id}>
                <Link
                  href={`/m/bookings/${b.id}`}
                  className="flex items-center gap-3 rounded-card bg-white p-4 shadow-card"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[14.5px] font-bold text-heading">
                        {invoiceNumber(b.id, b.created_at)}
                      </p>
                      <Tag tone={pill.tone}>{pill.label}</Tag>
                    </div>
                    <p className="mt-1 text-[12.5px] text-subheading line-clamp-1">
                      Booking with {carerName}
                      {formatHours(b.hours)}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11.5px] text-subheading">{date}</span>
                      <span className="text-[15px] font-bold text-heading">£{amount}</span>
                    </div>
                  </div>
                  <IconChevronRight />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 px-5 text-center text-[11.5px] text-subheading">
        Need a copy? Contact{" "}
        <a className="text-primary" href="mailto:billing@specialcarers.com">
          billing@specialcarers.com
        </a>
      </p>
    </div>
  );
}
