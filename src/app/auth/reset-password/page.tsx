import Image from "next/image";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = {
  title: "Set new password — SpecialCarers",
  description: "Set a new password for your SpecialCarers account.",
};

// Force a minimal layout for this page: no marketing header (and therefore
// no "Dashboard" escape hatch that would let the user bypass the password
// reset they were just sent here to complete), no footer nav. Just the
// logo and the form. This matches the standard pattern for forced-state
// auth screens (Stripe, Linear, Vercel all do this).
export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex flex-col bg-bg-screen">
      <header className="w-full px-6 py-6">
        <div className="mx-auto max-w-6xl">
          <Image
            src="/brand/logo.svg"
            alt="SpecialCarers"
            width={140}
            height={40}
            priority
          />
        </div>
      </header>

      <section className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Set a new password
          </h1>
          <p className="mt-2 text-slate-600">
            Choose a new password to finish resetting your account.
          </p>
          <div className="mt-8">
            <ResetPasswordForm redirectTo="/dashboard" />
          </div>
        </div>
      </section>

      <footer className="w-full px-6 py-6 text-center text-xs text-slate-500">
        © 2026 All Care 4 U Group Limited
      </footer>
    </main>
  );
}
