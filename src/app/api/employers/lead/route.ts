import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const company_name = String(formData.get("company_name") || "").trim();
  const contact_name = String(formData.get("contact_name") || "").trim();
  const work_email = String(formData.get("work_email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim() || null;
  const country = String(formData.get("country") || "OTHER").trim().toUpperCase();
  const employee_count = String(formData.get("employee_count") || "").trim() || null;
  const use_case = String(formData.get("use_case") || "").trim() || null;
  const message = String(formData.get("message") || "").trim() || null;

  const back = (q: string) =>
    NextResponse.redirect(new URL(`/employers/contact?status=${q}`, req.url), { status: 303 });

  if (!company_name || !contact_name) return back("missing");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(work_email)) return back("invalid_email");
  if (!["UK", "US", "OTHER"].includes(country)) return back("invalid_country");

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("submit_employer_lead", {
      p_company_name: company_name,
      p_contact_name: contact_name,
      p_work_email: work_email,
      p_phone: phone,
      p_country: country,
      p_employee_count: employee_count,
      p_use_case: use_case,
      p_message: message,
    });
    if (error) {
      console.error("Employer lead RPC error:", error);
      return back("error");
    }
  } catch (e) {
    console.error("Employer lead exception:", e);
    return back("error");
  }

  return NextResponse.redirect(new URL("/employers/contact?status=success", req.url), { status: 303 });
}
