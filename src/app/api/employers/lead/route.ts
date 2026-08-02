import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit, getRequestIp } from "@/lib/rate-limit";
import { validateLead } from "@/lib/anti-spam/validate-lead";
import { logSpamAttempt, recordHoneypotHit } from "@/lib/anti-spam/log-attempt";

const SOURCE_FORM = "employers_contact_page";

export async function POST(req: NextRequest) {
  const ip = getRequestIp(req);
  const ua = req.headers.get("user-agent")?.slice(0, 240) ?? null;

  const formData = await req.formData();
  const company_name = String(formData.get("company_name") || "").trim();
  const contact_name = String(formData.get("contact_name") || "").trim();
  const work_email = String(formData.get("work_email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim() || null;
  const country = String(formData.get("country") || "OTHER").trim().toUpperCase();
  const employee_count = String(formData.get("employee_count") || "").trim() || null;
  const use_case = String(formData.get("use_case") || "").trim() || null;
  const message = String(formData.get("message") || "").trim() || null;
  const website = String(formData.get("website") || "").trim(); // honeypot

  const back = (q: string) =>
    NextResponse.redirect(new URL(`/employers/contact?status=${q}`, req.url), { status: 303 });

  const rawPayload = {
    company_name,
    contact_name,
    work_email,
    phone,
    country,
    employee_count,
    use_case,
    message,
  };

  // Rate-limit FIRST — cheap, no I/O, no DB write. A bot hammering this
  // endpoint hits its redirect before we ever touch the honeypot/
  // validation/insert path. Previously the honeypot check ran first, so
  // every single bot request (the honeypot's exact target audience)
  // triggered an unconditional, un-throttled `spam_lead_attempts` insert
  // — this reordering closes that log-flooding gap (review finding).
  // Rate-limit rejections do NOT insert into spam_lead_attempts — the
  // rate limiter's whole point is to bound load.
  if (!rateLimit(`employers-lead:${ip}`, { limit: 3, windowMs: 60 * 60 * 1000 })) {
    return back("rate_limited");
  }

  // Honeypot: a real browser never fills this hidden field. Drop
  // silently (redirect to the normal success page) so bots don't learn
  // to look for it, but log the hit.
  if (website.length > 0) {
    recordHoneypotHit(SOURCE_FORM);
    await logSpamAttempt({
      sourceForm: SOURCE_FORM,
      rejectionReason: "HONEYPOT_HIT",
      ipAddress: ip,
      userAgent: ua,
      payload: { ...rawPayload, website: "[REDACTED-HONEYPOT-VALUE]" },
    });
    return NextResponse.redirect(new URL("/employers/contact?status=success", req.url), {
      status: 303,
    });
  }

  if (!company_name || !contact_name) return back("missing");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(work_email)) return back("invalid_email");
  if (!["UK", "US", "OTHER"].includes(country)) return back("invalid_country");

  // UK phone format is only enforced when the employer selected "UK" —
  // this form legitimately serves US/global employers too (see the
  // country selector), so we don't hard-block US-style numbers for
  // them. Free-webmail and random-string checks apply to everyone.
  // `use_case` is a constrained <select>, not free text, so it's not
  // passed through the random-string check (there's no `role` field
  // on this form — only company_name and contact_name are free text).
  const check = validateLead({
    name: contact_name,
    email: work_email,
    org: company_name,
    phone: country === "UK" ? phone ?? "" : undefined,
  });
  if (!check.valid) {
    await logSpamAttempt({
      sourceForm: SOURCE_FORM,
      rejectionReason: check.reason ?? "validation_failed",
      ipAddress: ip,
      userAgent: ua,
      payload: rawPayload,
    });
    if (check.reason?.includes("UK phone")) return back("invalid_phone");
    if (check.reason?.includes("organisation email")) return back("free_email");
    return back("invalid");
  }

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
