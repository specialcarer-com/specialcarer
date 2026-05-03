import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCaregiverProfile } from "@/lib/care/profile";
import { formatMoney } from "@/lib/care/services";
import BookingForm from "./booking-form";

export const dynamic = "force-dynamic";

export default async function BookPage({
  params,
}: {
  params: Promise<{ caregiverId: string }>;
}) {
  const { caregiverId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/book/${caregiverId}`);

  const admin = createAdminClient();

  const { data: caregiverAuthProfile } = await admin
    .from("profiles")
    .select("id, full_name, country, role")
    .eq("id", caregiverId)
    .maybeSingle();

  if (!caregiverAuthProfile || caregiverAuthProfile.role !== "caregiver") {
    notFound();
  }

  const caregiverProfile = await getCaregiverProfile(caregiverId);

  const { data: caregiverStripe } = await admin
    .from("caregiver_stripe_accounts")
    .select("stripe_account_id, charges_enabled, payouts_enabled, country")
    .eq("user_id", caregiverId)
    .maybeSingle();

  const ready = Boolean(
    caregiverStripe?.charges_enabled && caregiverStripe?.payouts_enabled,
  );

  const country =
    (caregiverProfile?.country ??
      (caregiverAuthProfile.country as "GB" | "US" | null) ??
      "GB") as "GB" | "US";
  const defaultCurrency: "gbp" | "usd" = country === "US" ? "usd" : "gbp";
  const defaultRate = caregiverProfile?.hourly_rate_cents
    ? Math.round(caregiverProfile.hourly_rate_cents / 100)
    : country === "US"
      ? 30
      : 20;

  const displayName =
    caregiverProfile?.display_name ??
    caregiverAuthProfile.full_name ??
    "Caregiver";

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <Link
        href={`/caregiver/${caregiverId}`}
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← Back to profile
      </Link>

      <div className="mt-3 flex items-center gap-4">
        {caregiverProfile?.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={caregiverProfile.photo_url}
            alt=""
            className="w-14 h-14 rounded-full object-cover bg-brand-50 flex-none"
          />
        ) : null}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Book {displayName}
          </h1>
          {caregiverProfile?.headline && (
            <p className="text-slate-600 mt-1 text-sm">
              {caregiverProfile.headline}
            </p>
          )}
        </div>
      </div>

      <p className="text-slate-600 mt-3">
        Funds are held securely until 24 hours after the shift completes, then
        released to your caregiver.
        {caregiverProfile?.hourly_rate_cents && caregiverProfile.currency && (
          <>
            {" "}Listed rate:{" "}
            <span className="font-medium text-slate-900">
              {formatMoney(
                caregiverProfile.hourly_rate_cents,
                caregiverProfile.currency,
              )}
              /hr
            </span>
            .
          </>
        )}
      </p>

      {!ready ? (
        <div className="mt-8 p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
          This caregiver hasn&rsquo;t finished setting up payouts yet, so we
          can&rsquo;t take a booking. Please check back soon.
        </div>
      ) : (
        <BookingForm
          caregiverId={caregiverId}
          caregiverName={displayName}
          defaultCurrency={defaultCurrency}
          defaultHourlyRate={defaultRate}
        />
      )}
    </div>
  );
}
