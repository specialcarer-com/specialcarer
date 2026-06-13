import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import AddCountryForm from "./AddCountryForm";
import CountryRow from "./CountryRow";

export const dynamic = "force-dynamic";

export type CountryRowData = {
  code: string;
  name: string;
  flag_emoji: string | null;
  enabled_for_signup: boolean;
  enabled_for_search: boolean;
  currency_code: string;
  default_locale: string;
  display_order: number;
  notes: string | null;
};

export default async function CountriesAdmin() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from("countries")
    .select(
      "code, name, flag_emoji, enabled_for_signup, enabled_for_search, currency_code, default_locale, display_order, notes",
    )
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  const rows = (data ?? []) as CountryRowData[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Countries</h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Enable or disable the countries SpecialCarers operates in. Turning on{" "}
          <strong>Signup</strong> makes a country appear in the carer onboarding
          country dropdown. <strong>Search</strong> controls whether its
          postcodes are accepted by find-care (wired up in a later release).
          Everything is billed in GBP for now.
        </p>
      </header>

      <AddCountryForm />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No countries yet. Add one above to get started.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Flag</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-center">Signup</th>
                <th className="px-4 py-3 text-center">Search</th>
                <th className="px-4 py-3">Currency</th>
                <th className="px-4 py-3">Locale</th>
                <th className="px-4 py-3 text-center">Order</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <CountryRow key={row.code} initial={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
