import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateReferralCode } from "@/lib/referrals/engine";
import ReferralBanner from "@/components/dashboard/ReferralBanner";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referrals — SpecialCarer" };

export default async function ReferralsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/dashboard/referrals");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  const role: "seeker" | "caregiver" =
    profile?.role === "caregiver" ? "caregiver" : "seeker";

  const code = await getOrCreateReferralCode(
    admin,
    user.id,
    profile?.full_name ?? null,
  );

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://specialcarer.com";

  const { data: claimsRaw } = await admin
    .from("referral_claims")
    .select("id, referred_id, status, signed_up_at, qualified_at")
    .eq("referrer_id", user.id)
    .order("signed_up_at", { ascending: false })
    .limit(50);
  const claims = claimsRaw ?? [];

  const refereeIds = claims.map((c) => c.referred_id);
  const { data: refereeProfiles } =
    refereeIds.length > 0
      ? await admin
          .from("profiles")
          .select("id, full_name")
          .in("id", refereeIds)
      : { data: [] };
  const refereeName = new Map(
    (refereeProfiles ?? []).map((p) => [p.id, p.full_name as string | null]),
  );

  const { data: credits } = await admin
    .from("referral_credits")
    .select("id, amount_cents, reason, created_at, redeemed_at, expires_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: balance } = await admin
    .from("v_user_credit_balance")
    .select("available_cents, lifetime_cents")
    .eq("user_id", user.id)
    .maybeSingle();

  const invited = claims.length;
  const qualified = claims.filter((c) => c.status === "qualified").length;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="px-6 py-5 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← Dashboard
          </Link>
          <h1 className="text-sm font-medium text-slate-700">
            Referral programme
          </h1>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 py-10">
        <ReferralBanner
          data={{
            code,
            shareUrl: `${origin}/r/${code}`,
            invited,
            qualified,
            availableCents: Number(balance?.available_cents ?? 0),
          }}
          role={role}
        />

        <div className="mt-10 grid lg:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-white border border-slate-100">
            <h2 className="text-lg font-semibold">How it works</h2>
            <ol className="mt-3 space-y-3 text-sm text-slate-700">
              <li>
                <span className="font-semibold text-brand-700">1.</span>{" "}
                Share your code or link with a friend.
              </li>
              <li>
                <span className="font-semibold text-brand-700">2.</span>{" "}
                They sign up using your code — it&rsquo;s pre-filled if they
                click your link.
              </li>
              <li>
                <span className="font-semibold text-brand-700">3.</span>{" "}
                When their first paid booking settles, you both get £20 in
                credit. Credits expire after 12 months.
              </li>
            </ol>
            <p className="mt-4 text-xs text-slate-500">
              Codes can&rsquo;t be used for self-referral. Each user can
              accept one code. Codes expire 90 days after sign-up if no
              qualifying booking is completed.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-slate-100">
            <h2 className="text-lg font-semibold">Your stats</h2>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div className="p-3 rounded-xl bg-slate-50">
                <dt className="text-xs text-slate-500">Invited</dt>
                <dd className="mt-1 text-xl font-semibold">{invited}</dd>
              </div>
              <div className="p-3 rounded-xl bg-slate-50">
                <dt className="text-xs text-slate-500">Qualified</dt>
                <dd className="mt-1 text-xl font-semibold">{qualified}</dd>
              </div>
              <div className="p-3 rounded-xl bg-slate-50">
                <dt className="text-xs text-slate-500">Lifetime credit</dt>
                <dd className="mt-1 text-xl font-semibold">
                  £{(Number(balance?.lifetime_cents ?? 0) / 100).toFixed(2)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-8 p-6 rounded-2xl bg-white border border-slate-100">
          <h2 className="text-lg font-semibold">Claims</h2>
          {claims.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No claims yet.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th className="py-2">Friend</th>
                  <th>Signed up</th>
                  <th>Status</th>
                  <th>Qualified</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="py-2">
                      {refereeName.get(c.referred_id) ?? "—"}
                    </td>
                    <td>{new Date(c.signed_up_at).toLocaleDateString()}</td>
                    <td>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.status === "qualified"
                            ? "bg-emerald-50 text-emerald-700"
                            : c.status === "pending"
                              ? "bg-amber-50 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td>
                      {c.qualified_at
                        ? new Date(c.qualified_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-6 p-6 rounded-2xl bg-white border border-slate-100">
          <h2 className="text-lg font-semibold">Credit history</h2>
          {(credits ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              No credits yet — credits appear here when a friend&rsquo;s
              first booking settles.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {(credits ?? []).map((c) => (
                <li
                  key={c.id}
                  className="py-2 flex items-center justify-between text-sm"
                >
                  <span>
                    {c.reason === "referrer_reward"
                      ? "Referral reward (you)"
                      : c.reason === "referee_reward"
                        ? "Welcome credit"
                        : "Adjustment"}
                    <span className="ml-2 text-xs text-slate-500">
                      {new Date(c.created_at).toLocaleDateString()}
                      {c.redeemed_at
                        ? ` · redeemed ${new Date(c.redeemed_at).toLocaleDateString()}`
                        : ""}
                    </span>
                  </span>
                  <span className="font-semibold">
                    £{(c.amount_cents / 100).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
