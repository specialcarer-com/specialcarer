import Link from "next/link";
import { LoginForm } from "./login-form";
import Image from "next/image";

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
    <main className="min-h-screen flex flex-col">
      <header className="px-6 py-5 border-b border-slate-100">
        <Link href="/" className="flex items-center gap-2 w-fit">
          <Image src="/brand/logo.svg" alt="SpecialCarer" width={161} height={121} className="h-9 w-auto" priority />
        </Link>
      </header>

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
    </main>
  );
}
