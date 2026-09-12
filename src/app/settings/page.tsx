/**
 * /settings
 *
 * Minimal settings hub — the entry point that surfaces danger-zone
 * without changing the existing site-footer link (which still points
 * to /account/delete, the fallback hard-delete flow that co-exists
 * with C5's self-service flow by design).
 *
 * As the settings surface grows (billing, notifications, profile),
 * this page becomes the index. For C5 it just links to the one
 * section that exists today.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Settings — SpecialCarer",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/settings");

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="px-6 py-5 bg-white border-b border-slate-100">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/brand/logo.svg"
              alt="SpecialCarer"
              width={161}
              height={121}
              className="h-9 w-auto"
              priority
            />
          </Link>
          <span className="text-sm text-slate-600 hidden sm:inline">
            {user.email}
          </span>
        </div>
      </header>
      <div className="flex-1 px-6 py-10">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold text-slate-900 mb-6">Settings</h1>
          <ul className="space-y-3">
            <li>
              <Link
                href="/settings/danger-zone"
                className="block p-4 rounded-xl border border-slate-200 hover:border-red-300 hover:bg-red-50/40 transition"
              >
                <span className="block font-medium text-slate-900">
                  Danger zone
                </span>
                <span className="block text-sm text-slate-600">
                  Delete your account and manage destructive actions.
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
