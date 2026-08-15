import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ReferenceConsent } from "@/lib/references/consent";
import ConsentCapture from "./ConsentCapture";
export const dynamic = "force-dynamic";
export const metadata = { title: "Reference consent — SpecialCarer" };
export default async function ConsentPage() { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login?redirect=/dashboard/vetting/references/consent"); const [{ data: consent }, { data: profile }] = await Promise.all([supabase.from("carer_reference_consents").select("*").eq("carer_id", user.id).maybeSingle<ReferenceConsent>(), supabase.from("caregiver_profiles").select("display_name").eq("user_id", user.id).maybeSingle<{ display_name: string | null }>()]); return <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6"><div className="flex items-center justify-between"><h1 className="text-2xl font-bold text-[#0F1416]">Reference collection consent</h1><Link href="/dashboard/vetting/references" className="text-sm text-slate-600 hover:text-slate-900">← Back to references</Link></div><ConsentCapture initialConsent={consent ?? null} defaultName={profile?.display_name ?? ""} /></div>; }
