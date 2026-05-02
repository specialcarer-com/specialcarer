import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const { data: caregiverProfile } = await admin
    .from("profiles")
    .select("id, full_name, country, role")
    .eq("id", caregiverId)
    .maybeSingle();

  if (!caregiverProfile || caregiverProfile.role !== "caregiver") {
    notFound();
  }

  const { data: caregiverStripe } = await admin
    .from("caregiver_stripe_accounts")
    .select("stripe_account_id, charges_enabled, payouts_enabled, country")
    .eq("user_id", caregiverId)
    .maybeSingle();

  const ready = Boolean(
    caregiverStripe?.charges_enabled && caregiverStripe?.payouts_enabled
  );

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <Link
        href="/dashboard"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← Dashboard
      </Link>

      <h1 className="text-3xl font-semibold tracking-tight mt-2">
        Book {caregiverProfile.full_name || "this caregiver"}
      </h1>
      <p className="text-slate-600 mt-1">
        Funds are held securely until 24 hours after the shift completes, then
        released to your caregiver.
      </p>

      {!ready ? (
        <div className="mt-8 p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">
          This caregiver hasn&rsquo;t finished setting up payouts yet, so we
          can&rsquo;t take a booking. Please check back soon.
        </div>
      ) : (
        <BookingForm
          caregiverId={caregiverId}
          caregiverName={caregiverProfile.full_name || "Caregiver"}
          defaultCurrency={
            (caregiverStripe?.country as "GB" | "US" | undefined) === "US"
              ? "usd"
              : "gbp"
          }
        />
      )}
    </div>
  );
}
