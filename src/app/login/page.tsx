import Link from "next/link";
import { LoginForm } from "./login-form";
import MarketingShell from "@/components/marketing-shell";
import PageHeroBanner from "@/components/page-hero-banner";

export const metadata = {
  title: "Sign in — SpecialCarer",
  description:
    "Sign in to SpecialCarer — for caregivers, families, and organisations.",
};

const AUDIENCES = [
  {
    href: "/login/caregiver",
    title: "For caregivers",
    desc: "Pick up shifts, manage bookings, and get paid.",
  },
  {
    href: "/login/family",
    title: "For families",
    desc: "Book trusted carers and manage your care plan.",
  },
  {
    href: "/login/organisation",
    title: "For organisations",
    desc: "Care homes, councils, NHS trusts, schools, and charities.",
  },
] as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirect || "/dashboard";
  const sent = params.sent === "1";
  const error = params.error;

  // Preserve in-flight sign-ins: if the user is mid-flow (sent=1) or returning
  // from a callback with an error, keep the legacy single-form layout so we
  // never break a magic-link round trip.
  const showFormFallback = sent || Boolean(error);

  return (
    <MarketingShell>
      <PageHeroBanner pageKey="account.login" height="md" tint="soft" />

      <section className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-3xl">
          {showFormFallback ? (
            <div className="max-w-md mx-auto">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                Sign in to SpecialCarer
              </h1>
              <p className="mt-2 text-slate-600">
                Use your email or your Google account. New here? We&rsquo;ll
                set you up automatically.
              </p>

              {sent && (
                <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
                  <strong>Check your inbox.</strong> We&rsquo;ve sent you a
                  one-click sign-in link. It expires in 1 hour.
                </div>
              )}
              {error && (
                <div className="mt-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-sm">
                  {error === "callback"
                    ? "We couldn't sign you in. The link may have expired — please try again."
                    : "Something went wrong. Please try again."}
                </div>
              )}

              <div className="mt-8">
                <LoginForm redirectTo={redirectTo} />
              </div>

              <p className="mt-8 text-xs text-slate-500 text-center">
                By continuing, you agree to our{" "}
                <Link href="/terms" className="underline hover:text-slate-700">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline hover:text-slate-700">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          ) : (
            <>
              <div className="text-center max-w-2xl mx-auto">
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
                  Sign in to SpecialCarer
                </h1>
                <p className="mt-3 text-slate-600">
                  Pick the account type you&rsquo;re signing in with. Each
                  takes you to the right place.
                </p>
              </div>

              <ul className="mt-10 grid gap-4 md:grid-cols-3">
                {AUDIENCES.map((a) => (
                  <li key={a.href}>
                    <Link
                      href={a.href}
                      className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-brand hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand"
                    >
                      <span className="text-lg font-semibold text-slate-900 group-hover:text-brand">
                        {a.title}
                      </span>
                      <span className="mt-2 text-sm text-slate-600">
                        {a.desc}
                      </span>
                      <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-brand">
                        Continue
                        <span
                          aria-hidden
                          className="transition-transform group-hover:translate-x-0.5"
                        >
                          &rarr;
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <p className="mt-10 text-xs text-slate-500 text-center">
                By continuing, you agree to our{" "}
                <Link href="/terms" className="underline hover:text-slate-700">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline hover:text-slate-700">
                  Privacy Policy
                </Link>
                .
              </p>
            </>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
