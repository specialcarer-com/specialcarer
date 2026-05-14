import Link from "next/link";
import { LoginForm } from "./login-form";
import MarketingShell from "@/components/marketing-shell";
import PageHeroBanner from "@/components/page-hero-banner";

export type AudienceSignInProps = {
  audience: "caregiver" | "family" | "organisation";
  pageKey: string;
  headline: string;
  intro: string;
  signupCta?: { label: string; href: string; lead: string } | null;
  redirectTo: string;
  sent: boolean;
  error?: string;
};

/**
 * Shared layout for the per-audience sign-in pages. Each variant gets:
 *  - the standard SiteHeader (via MarketingShell)
 *  - a hero banner tuned to the audience
 *  - audience-specific copy
 *  - the standard LoginForm with a per-audience redirect destination
 *  - an optional signup CTA for new users
 */
export default function AudienceSignIn({
  pageKey,
  headline,
  intro,
  signupCta,
  redirectTo,
  sent,
  error,
}: AudienceSignInProps) {
  return (
    <MarketingShell>
      <PageHeroBanner pageKey={pageKey} height="md" tint="soft" />

      <section className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            {headline}
          </h1>
          <p className="mt-2 text-slate-600">{intro}</p>

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

          {signupCta ? (
            <div className="mt-8 p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <p className="text-sm text-slate-700">{signupCta.lead}</p>
              <Link
                href={signupCta.href}
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand hover:text-brand-600"
              >
                {signupCta.label}
                <span aria-hidden>&rarr;</span>
              </Link>
            </div>
          ) : null}

          <p className="mt-8 text-xs text-slate-500 text-center">
            Not the right account?{" "}
            <Link href="/login" className="underline hover:text-slate-700">
              Choose a different sign-in
            </Link>
          </p>

          <p className="mt-2 text-xs text-slate-500 text-center">
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
      </section>
    </MarketingShell>
  );
}
