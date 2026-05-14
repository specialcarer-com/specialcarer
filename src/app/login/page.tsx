import Link from "next/link";
import { LoginForm } from "./login-form";
import MarketingShell from "@/components/marketing-shell";
import PageHeroBanner from "@/components/page-hero-banner";

export const metadata = {
  title: "Sign in — SpecialCarer",
  description: "Sign in to SpecialCarer to book or provide care.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirect || "/dashboard";
  const sent = params.sent === "1";
  const error = params.error;

  return (
    <MarketingShell>
      <PageHeroBanner pageKey="account.login" height="md" tint="soft" />

      <section className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Sign in to SpecialCarer
          </h1>
          <p className="mt-2 text-slate-600">
            Use your email or your Google account. New here? We&rsquo;ll set you
            up automatically.
          </p>

          {sent && (
            <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
              <strong>Check your inbox.</strong> We&rsquo;ve sent you a one-click
              sign-in link. It expires in 1 hour.
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
      </section>
    </MarketingShell>
  );
}
