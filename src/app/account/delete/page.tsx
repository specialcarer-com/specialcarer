import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DeleteAccountClient from "./delete-client";
import Image from "next/image";

export const metadata = {
  title: "Delete account — SpecialCarer",
};

export default async function DeleteAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/account/delete");

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="px-6 py-5 bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/brand/logo.svg" alt="SpecialCarer" width={161} height={121} className="h-9 w-auto" priority />
          </Link>
          <span className="text-sm text-slate-600 hidden sm:inline">
            {user.email}
          </span>
        </div>
      </header>

      <section className="flex-1 px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-semibold tracking-tight">
            Delete your account
          </h1>
          <p className="mt-3 text-slate-600">
            This permanently removes your profile, bookings history, location
            data, and any saved payout details. It cannot be undone.
          </p>

          <div className="mt-6 p-5 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900 space-y-2">
            <p className="font-medium">What gets deleted:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Your profile, name, photos, and contact details</li>
              <li>Booking history and messages</li>
              <li>All location pings recorded during shifts</li>
              <li>Any pending background-check sessions</li>
              <li>Stripe payout connection (if any)</li>
            </ul>
            <p className="mt-2">
              Completed booking and payment records may be retained for up to
              7 years to satisfy UK & US tax/audit obligations, with personal
              identifiers redacted.
            </p>
          </div>

          <DeleteAccountClient userEmail={user.email ?? ""} />
        </div>
      </section>
    </main>
  );
}
