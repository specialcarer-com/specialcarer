import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PayoutsClient from "./payouts-client";

export const dynamic = "force-dynamic";

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarded?: string; refresh?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/dashboard/payouts");

  const admin = createAdminClient();
  const { data: account } = await admin
    .from("caregiver_stripe_accounts")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: profile } = await admin
    .from("profiles")
    .select("role, country")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Dashboard
        </Link>
        <h1 className="text-3xl font-semibold mt-2">Payouts</h1>
        <p className="text-slate-600 mt-1">
          Connect your bank account so we can pay you for completed shifts.
          Powered by Stripe.
        </p>
      </div>

      {params.onboarded === "1" && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
          Stripe onboarding complete. Your account status will refresh in a
          moment.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 p-6 bg-white">
        <h2 className="font-medium">Stripe Connect status</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <Row label="Account">
            {account?.stripe_account_id ?? "Not created yet"}
          </Row>
          <Row label="Country">
            {account?.country ?? profile?.country ?? "—"}
          </Row>
          <Row label="Details submitted">
            {account?.details_submitted ? "Yes" : "No"}
          </Row>
          <Row label="Charges enabled">
            {account?.charges_enabled ? "Yes" : "No"}
          </Row>
          <Row label="Payouts enabled">
            {account?.payouts_enabled ? "Yes" : "No"}
          </Row>
          {account?.requirements_currently_due &&
            Array.isArray(account.requirements_currently_due) &&
            account.requirements_currently_due.length > 0 && (
              <Row label="Required next">
                <span className="text-amber-700">
                  {(account.requirements_currently_due as string[]).join(", ")}
                </span>
              </Row>
            )}
        </dl>

        <div className="mt-6">
          <PayoutsClient
            hasAccount={Boolean(account?.stripe_account_id)}
            payoutsEnabled={Boolean(account?.payouts_enabled)}
            defaultCountry={
              (account?.country as "GB" | "US") ??
              (profile?.country as "GB" | "US") ??
              "GB"
            }
          />
        </div>
      </div>

      <p className="text-xs text-slate-500 mt-6">
        SpecialCarer uses Stripe Connect Express to handle payouts, identity
        verification, and tax reporting. We never see or store your bank
        details — Stripe holds them securely.
      </p>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-44 text-slate-500 shrink-0">{label}</dt>
      <dd className="text-slate-900 font-mono text-xs break-all">{children}</dd>
    </div>
  );
}
