import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join SpecialCarer — referral" };

export default async function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: raw } = await params;
  const code = (raw ?? "").toUpperCase().trim();
  if (!code) redirect("/");

  const admin = createAdminClient();
  const { data: codeRow } = await admin
    .from("referral_codes")
    .select("user_id")
    .eq("code", code)
    .maybeSingle();
  const valid = !!codeRow?.user_id;

  // Try to fetch the referrer's first name so the page can be a little
  // warmer. RLS doesn't matter — we're using the admin client.
  let referrerFirst: string | null = null;
  if (valid) {
    const { data: p } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", codeRow!.user_id)
      .maybeSingle();
    referrerFirst = p?.full_name?.split(" ")[0] ?? null;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="px-6 py-5 bg-white border-b border-slate-100">
        <div className="max-w-5xl mx-auto">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image
              src="/brand/logo.svg"
              alt="SpecialCarer"
              width={161}
              height={121}
              className="h-9 w-auto"
              priority
            />
          </Link>
        </div>
      </header>

      <section
        className="text-white"
        style={{
          background:
            "linear-gradient(135deg, #084C4B 0%, #0B6463 50%, #0E7C7B 100%)",
        }}
      >
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          {valid ? (
            <>
              <span
                className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide"
                style={{ background: "#F4A261", color: "#3F2A14" }}
              >
                You&rsquo;ve been invited
              </span>
              <h1 className="mt-4 text-4xl sm:text-5xl font-semibold">
                Get £20 off your first booking
              </h1>
              <p className="mt-3 text-white/90 text-lg">
                {referrerFirst
                  ? `${referrerFirst} invited you to SpecialCarer.`
                  : "A friend invited you to SpecialCarer."}{" "}
                Sign up with their code and they get £20 when you complete
                your first booking.
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/10 border border-white/20 px-4 py-2 font-mono font-semibold">
                {code}
              </div>
              <div className="mt-8">
                <Link
                  href={`/signup?ref=${encodeURIComponent(code)}`}
                  className="inline-block px-6 py-3 rounded-xl bg-white text-brand-700 font-semibold hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Create your account
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-semibold">
                That referral code isn&rsquo;t valid
              </h1>
              <p className="mt-3 text-white/90">
                It might be mistyped or expired. You can still sign up and
                see if a friend will share a fresh code.
              </p>
              <div className="mt-8">
                <Link
                  href="/signup"
                  className="inline-block px-6 py-3 rounded-xl bg-white text-brand-700 font-semibold hover:bg-white/90"
                >
                  Create your account
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-12 grid sm:grid-cols-3 gap-4 text-center">
        <Step n={1} title="Sign up">
          We&rsquo;ll pre-fill the referral code for you.
        </Step>
        <Step n={2} title="Book your first carer">
          Choose someone who fits, schedule, and pay securely.
        </Step>
        <Step n={3} title="£20 lands in your account">
          When the booking settles, you both get £20 in credit.
        </Step>
      </section>
    </main>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-5 rounded-2xl bg-white border border-slate-100">
      <div
        className="w-10 h-10 mx-auto rounded-full bg-brand-50 text-brand-700 font-bold flex items-center justify-center"
        aria-hidden
      >
        {n}
      </div>
      <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{children}</p>
    </div>
  );
}
