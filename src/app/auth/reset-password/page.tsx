import MarketingShell from "@/components/marketing-shell";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = {
  title: "Set new password — SpecialCarer",
  description: "Set a new password for your SpecialCarer account.",
};

export default function ResetPasswordPage() {
  return (
    <MarketingShell>
      <section className="flex-1 flex items-center justify-center px-6 py-16">
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
    </MarketingShell>
  );
}
