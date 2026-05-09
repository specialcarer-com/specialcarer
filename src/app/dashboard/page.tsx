import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeReadiness } from "@/lib/care/profile";
import { CARER_FEE_PERCENT } from "@/lib/fees/config";
import Image from "next/image";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Dashboard — SpecialCarer",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Awaiting payment",
  paid: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  paid_out: "Paid out",
  cancelled: "Cancelled",
  refunded: "Refunded",
  disputed: "Disputed",
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  accepted: "bg-amber-50 text-amber-800",
  paid: "bg-brand-50 text-brand-700",
  in_progress: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  paid_out: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-500",
  refunded: "bg-slate-100 text-slate-500",
  disputed: "bg-rose-50 text-rose-700",
};

function fmtMoney(cents: number | null | undefined, currency: string | null | undefined) {
  if (cents == null) return "—";
  const sym = (currency ?? "gbp").toLowerCase() === "usd" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, country, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.full_name || !profile?.country) redirect("/onboarding");

  const isCaregiver = profile.role === "caregiver";
  const admin = createAdminClient();

  // Fetch bookings for this user's role
  const bookingFilter = isCaregiver ? "caregiver_id" : "seeker_id";
  const { data: bookings } = await admin
    .from("bookings")
    .select(
      "id, seeker_id, caregiver_id, status, starts_at, ends_at, hours, total_cents, subtotal_cents, platform_fee_cents, currency, location_city, location_country, service_type",
    )
    .eq(bookingFilter, user.id)
    .order("starts_at", { ascending: false })
    .limit(50);

  // Counterparty names
  const counterpartyIds = Array.from(
    new Set(
      (bookings ?? []).map((b) => (isCaregiver ? b.seeker_id : b.caregiver_id)),
    ),
  );
  const { data: counterparties } = counterpartyIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", counterpartyIds)
    : { data: [] };
  const nameById = new Map((counterparties ?? []).map((p) => [p.id, p.full_name]));

  const now = Date.now();
  const upcoming = (bookings ?? []).filter(
    (b) =>
      ["pending", "accepted", "paid", "in_progress"].includes(b.status) &&
      new Date(b.ends_at).getTime() >= now,
  );
  const past = (bookings ?? []).filter(
    (b) =>
      ["completed", "paid_out", "cancelled", "refunded"].includes(b.status) ||
      new Date(b.ends_at).getTime() < now,
  );

  // Caregiver-only: readiness + earnings
  const readiness = isCaregiver ? await computeReadiness(user.id) : null;

  // Carer take-home = subtotal − carer-side deduction (CARER_FEE_PERCENT).
  // The `platform_fee_cents` column stores the *combined* platform take
  // (client uplift + carer deduction), so we can't use it directly for
  // carer earnings — derive from subtotal instead.
  const carerPayoutCents = (sub: number) =>
    sub - Math.round((sub * CARER_FEE_PERCENT) / 100);
  let totalEarnedCents = 0;
  let pendingPayoutCents = 0;
  if (isCaregiver) {
    for (const b of bookings ?? []) {
      const payout = carerPayoutCents(b.subtotal_cents ?? 0);
      if (b.status === "paid_out") totalEarnedCents += payout;
      if (b.status === "completed") pendingPayoutCents += payout;
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-slate-50">
      <header className="px-6 py-5 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/brand/logo.svg" alt="SpecialCarer" width={161} height={121} className="h-9 w-auto" priority />
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600 hidden sm:inline">
              {user.email}
            </span>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="px-3 py-1.5 rounded-full border border-slate-200 text-sm hover:bg-slate-100 transition"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="flex-1 px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
                {isCaregiver ? "Caregiver account" : "Seeker account"} ·{" "}
                {profile.country === "US" ? "United States" : "United Kingdom"}
              </span>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight">
                Welcome, {profile.full_name.split(" ")[0]}.
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {!isCaregiver && (
                <Link
                  href="/find-care"
                  className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
                >
                  Find care
                </Link>
              )}
              {!isCaregiver && (
                <Link
                  href="/account/saved"
                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-medium hover:bg-slate-50 transition"
                >
                  Saved
                </Link>
              )}
              {isCaregiver && (
                <Link
                  href="/dashboard/profile"
                  className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600 transition"
                >
                  Edit profile
                </Link>
              )}
            </div>
          </div>

          {/* Caregiver: profile readiness card */}
          {isCaregiver && readiness && (
            <div className="mt-8 p-6 rounded-2xl bg-white border border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-slate-900">
                    {readiness.isPublished
                      ? "You're live on SpecialCarer"
                      : readiness.isPublishable
                        ? "Ready to publish"
                        : "Get publish-ready"}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {readiness.isPublished
                      ? "Families can find and book you."
                      : "Complete the steps below to start receiving bookings."}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium ${
                    readiness.isPublished
                      ? "bg-emerald-100 text-emerald-800"
                      : readiness.isPublishable
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {readiness.isPublished ? "Live" : readiness.isPublishable ? "Ready" : "Setup"}
                </span>
              </div>

              <ul className="mt-5 grid sm:grid-cols-2 gap-2 text-sm">
                <Step
                  done={readiness.hasName && readiness.hasBio && readiness.hasService && readiness.hasRate && readiness.hasLocation}
                  label="Profile, services, rate"
                  href="/dashboard/profile"
                />
                <Step
                  done={readiness.payoutsEnabled}
                  label="Stripe payouts connected"
                  href="/dashboard/payouts"
                />
                <Step
                  done={readiness.bgChecksCleared}
                  label={
                    readiness.bgChecksCleared
                      ? "Background checks cleared"
                      : `Background checks (${readiness.missingChecks.length} missing)`
                  }
                  href="/dashboard/verification"
                />
                <Step
                  done={false}
                  label="Get fully vetted (references, certs, quiz, interview, course)"
                  href="/dashboard/vetting"
                />
                <Step
                  done={readiness.isPublished}
                  label={readiness.isPublished ? "Published" : "Publish profile"}
                  href="/dashboard/profile"
                />
              </ul>
            </div>
          )}

          {/* Caregiver: earnings */}
          {isCaregiver && (
            <div className="mt-6 grid sm:grid-cols-3 gap-3">
              <Stat
                label="Lifetime payouts"
                value={fmtMoney(totalEarnedCents, profile.country === "US" ? "usd" : "gbp")}
              />
              <Stat
                label="Pending release"
                value={fmtMoney(pendingPayoutCents, profile.country === "US" ? "usd" : "gbp")}
                hint="24h hold after each shift"
              />
              <Stat label="Bookings to date" value={String((bookings ?? []).length)} />
            </div>
          )}

          {/* Bookings */}
          <div className="mt-10">
            <h2 className="text-xl font-semibold">Upcoming</h2>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                {isCaregiver
                  ? "No upcoming shifts."
                  : "No upcoming bookings yet."}
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {upcoming.map((b) => {
                  const otherId = isCaregiver ? b.seeker_id : b.caregiver_id;
                  return (
                    <li key={b.id}>
                      <Link
                        href={`/dashboard/bookings/${b.id}`}
                        className="block p-4 rounded-2xl bg-white border border-slate-100 hover:border-brand-200 hover:shadow-sm transition"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-900">
                              {nameById.get(otherId) ?? (isCaregiver ? "Family" : "Caregiver")}
                            </div>
                            <div className="text-sm text-slate-600">
                              {new Date(b.starts_at).toLocaleString([], {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              · {b.hours}h · {b.location_city ?? "—"}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_TONE[b.status] ?? "bg-slate-100"}`}
                            >
                              {STATUS_LABEL[b.status] ?? b.status}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {fmtMoney(
                                isCaregiver
                                  ? carerPayoutCents(b.subtotal_cents ?? 0)
                                  : b.total_cents,
                                b.currency,
                              )}
                              {isCaregiver && (
                                <span className="ml-1 text-[10px] font-normal text-slate-500">
                                  take-home
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-10">
            <h2 className="text-xl font-semibold">Past</h2>
            {past.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No past bookings.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {past.slice(0, 10).map((b) => {
                  const otherId = isCaregiver ? b.seeker_id : b.caregiver_id;
                  return (
                    <li key={b.id}>
                      <Link
                        href={`/dashboard/bookings/${b.id}`}
                        className="block p-4 rounded-2xl bg-white border border-slate-100 hover:border-brand-200 transition"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-900">
                              {nameById.get(otherId) ?? (isCaregiver ? "Family" : "Caregiver")}
                            </div>
                            <div className="text-sm text-slate-600">
                              {new Date(b.starts_at).toLocaleDateString()} ·{" "}
                              {b.hours}h
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_TONE[b.status] ?? "bg-slate-100"}`}
                            >
                              {STATUS_LABEL[b.status] ?? b.status}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {fmtMoney(
                                isCaregiver
                                  ? carerPayoutCents(b.subtotal_cents ?? 0)
                                  : b.total_cents,
                                b.currency,
                              )}
                              {isCaregiver && (
                                <span className="ml-1 text-[10px] font-normal text-slate-500">
                                  take-home
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Step({ done, label, href }: { done: boolean; label: string; href: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-brand-200 transition"
      >
        <span
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-none ${
            done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
          }`}
          aria-hidden
        >
          {done ? "✓" : ""}
        </span>
        <span className={done ? "text-slate-900" : "text-slate-700"}>{label}</span>
      </Link>
    </li>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="p-5 rounded-2xl bg-white border border-slate-100">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
