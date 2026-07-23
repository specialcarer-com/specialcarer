"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { TotpEnrolment } from "@/components/security/TotpEnrolment";

function AdminMfaSetupInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/admin/countries";

  return (
    <div className="min-h-screen bg-[#F4EFE6] flex flex-col">
      <header className="border-b border-[#0F1416]/10 bg-white">
        <div className="max-w-lg mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="SpecialCarer">
            <Image src="/brand/logo.svg" alt="" width={120} height={40} className="h-7 w-auto" />
          </Link>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#039EA0]">
            Admin security
          </span>
        </div>
      </header>
      <main className="flex-1 max-w-lg mx-auto w-full px-4 sm:px-6 py-10">
        <h1 className="text-2xl font-bold text-[#0F1416]">Set up two-factor authentication</h1>
        <p className="mt-2 text-sm text-[#0F1416]/70 leading-relaxed">
          Admin accounts must use TOTP two-factor authentication. Use an authenticator app
          such as 1Password, Google Authenticator, Microsoft Authenticator, or Authy.
        </p>
        <div className="mt-6">
          <TotpEnrolment required onDone={() => router.replace(next)} />
        </div>
        <p className="mt-6 text-xs text-[#0F1416]/60 leading-relaxed">
          Lost your authenticator device? Contact support for identity verification and
          factor reset.
        </p>
      </main>
    </div>
  );
}

export default function AdminMfaSetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F4EFE6]" />}>
      <AdminMfaSetupInner />
    </Suspense>
  );
}
