import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CertificationsClient from "./CertificationsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Certifications — SpecialCarer" };

export default async function CertificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/dashboard/vetting/certifications");

  const { data } = await supabase
    .from("carer_certifications")
    .select(
      "id, cert_type, issuer, issued_at, expires_at, file_path, status, rejection_reason, created_at",
    )
    .eq("carer_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Certifications</h1>
        <Link
          href="/dashboard/vetting"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to vetting
        </Link>
      </div>
      <p className="text-sm text-slate-600">
        Upload your certificates as PDF or image files. Our team checks each
        one and marks it verified — usually within 48 hours.
      </p>
      <CertificationsClient initial={data ?? []} />
    </div>
  );
}
