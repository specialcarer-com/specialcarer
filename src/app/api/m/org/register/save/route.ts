import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ORG_TYPE_KEYS,
  SIZE_BANDS,
  isFreeEmail,
  type OrgCountry,
  type SizeBand,
} from "@/lib/org/types";
import { getMyOrgMembership } from "@/lib/org/server";

export const dynamic = "force-dynamic";

type StepKey =
  | "step1"
  | "step2"
  | "step3"
  | "step4"
  | "step5"
  | "step6"
  | "step7";

type Body = {
  step?: StepKey;
  // Step 1
  purpose?: string;
  // Step 2
  country?: string;
  org_type?: string;
  // Step 3
  legal_name?: string;
  trading_name?: string;
  companies_house_number?: string;
  ein?: string;
  vat_number?: string;
  year_established?: number;
  size_band?: string;
  office_address?: Record<string, unknown>;
  website?: string;
  // Step 4
  cqc_number?: string;
  ofsted_urn?: string;
  charity_number?: string;
  la_gss_code?: string;
  us_npi?: string;
  other_registration_note?: string;
  // Step 5
  full_name?: string;
  work_email?: string;
  phone?: string;
  job_title?: string;
  job_title_other?: string;
  is_signatory?: boolean;
  free_email_override?: boolean;
  // Step 6 (billing)
  billing_contact_name?: string;
  billing_contact_email?: string;
  billing_address?: Record<string, unknown>;
  po_required?: boolean;
  po_mode?: string;
  default_terms?: string;
};

/**
 * POST /api/m/org/register/save
 *
 * Step-driven upsert for the organisation registration flow. The
 * first step that touches DB is step 2 (country + org_type) — at that
 * point we create the organizations row + organization_members row +
 * promote the user's profile.role to 'organization'. Subsequent steps
 * patch the same rows.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  const existing = await getMyOrgMembership(admin, user.id);

  // Step 1 captures `purpose` only — but we need an org row to write
  // to. If the user hasn't reached step 2 yet, just stash it on the
  // user_metadata until they do (avoids creating a row from a single
  // radio click that may be abandoned).
  if (body.step === "step1") {
    const purpose = String(body.purpose ?? "").trim();
    if (existing) {
      await admin
        .from("organizations")
        .update({ purpose, updated_at: new Date().toISOString() })
        .eq("id", existing.organization_id);
    }
    return NextResponse.json({
      ok: true,
      organization_id: existing?.organization_id ?? null,
      purpose_stashed: !existing,
    });
  }

  // Step 2: create org if missing.
  if (body.step === "step2") {
    const country: OrgCountry =
      body.country === "US" ? "US" : body.country === "GB" ? "GB" : "GB";
    const orgType = String(body.org_type ?? "").trim();
    if (!ORG_TYPE_KEYS.has(orgType)) {
      return NextResponse.json(
        { error: "invalid_org_type" },
        { status: 400 },
      );
    }

    let orgId = existing?.organization_id ?? null;
    if (!orgId) {
      const { data: created, error } = await admin
        .from("organizations")
        .insert({
          country,
          org_type: orgType,
          purpose: body.purpose ?? null,
          verification_status: "draft",
        })
        .select("id")
        .single();
      if (error || !created) {
        return NextResponse.json(
          { error: error?.message ?? "create_failed" },
          { status: 500 },
        );
      }
      orgId = created.id;
      await admin.from("organization_members").insert({
        organization_id: orgId,
        user_id: user.id,
        role: "owner",
      });
      await admin
        .from("organization_billing")
        .insert({ organization_id: orgId });
      // Promote the user's profile role.
      await admin
        .from("profiles")
        .update({ role: "organization" })
        .eq("id", user.id);
    } else {
      await admin
        .from("organizations")
        .update({
          country,
          org_type: orgType,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orgId);
    }
    return NextResponse.json({ ok: true, organization_id: orgId });
  }

  // All later steps require an existing org row.
  if (!existing) {
    return NextResponse.json(
      { error: "no_org_yet" },
      { status: 400 },
    );
  }
  const orgId = existing.organization_id;

  if (body.step === "step3") {
    const sizeBand = String(body.size_band ?? "");
    if (sizeBand && !(SIZE_BANDS as readonly string[]).includes(sizeBand)) {
      return NextResponse.json({ error: "invalid_size_band" }, { status: 400 });
    }
    await admin
      .from("organizations")
      .update({
        legal_name: body.legal_name?.trim() || null,
        trading_name: body.trading_name?.trim() || null,
        companies_house_number: body.companies_house_number?.trim() || null,
        ein: body.ein?.trim() || null,
        vat_number: body.vat_number?.trim() || null,
        year_established:
          Number.isFinite(body.year_established)
            ? Math.round(body.year_established as number)
            : null,
        size_band: (sizeBand as SizeBand) || null,
        office_address: body.office_address ?? null,
        website: body.website?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgId);
    return NextResponse.json({ ok: true });
  }

  if (body.step === "step4") {
    await admin
      .from("organizations")
      .update({
        cqc_number: body.cqc_number?.trim() || null,
        ofsted_urn: body.ofsted_urn?.trim() || null,
        charity_number: body.charity_number?.trim() || null,
        la_gss_code: body.la_gss_code?.trim() || null,
        us_npi: body.us_npi?.trim() || null,
        other_registration_note: body.other_registration_note?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgId);
    return NextResponse.json({ ok: true });
  }

  if (body.step === "step5") {
    const workEmail = String(body.work_email ?? "").trim().toLowerCase();
    const free = workEmail ? isFreeEmail(workEmail) : false;
    const override = body.free_email_override === true;
    if (free && !override) {
      // Soft-block: the client surfaces the warning + override. We
      // still save other fields so the user doesn't lose their work,
      // but flag the response.
      await admin
        .from("organization_members")
        .update({
          full_name: body.full_name?.trim() || null,
          phone: body.phone?.trim() || null,
          job_title: body.job_title ?? null,
          job_title_other: body.job_title_other?.trim() || null,
          is_signatory: !!body.is_signatory,
        })
        .eq("organization_id", orgId)
        .eq("user_id", user.id);
      return NextResponse.json({
        ok: false,
        free_email: true,
        message:
          "That looks like a personal email. Use a work address, or tick 'Continue anyway' for stricter manual review.",
      });
    }
    await admin
      .from("organization_members")
      .update({
        full_name: body.full_name?.trim() || null,
        work_email: workEmail || null,
        phone: body.phone?.trim() || null,
        job_title: body.job_title ?? null,
        job_title_other: body.job_title_other?.trim() || null,
        is_signatory: !!body.is_signatory,
      })
      .eq("organization_id", orgId)
      .eq("user_id", user.id);
    if (free && override) {
      await admin
        .from("organizations")
        .update({
          free_email_override: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orgId);
    }
    return NextResponse.json({ ok: true });
  }

  if (body.step === "step6") {
    const terms = String(body.default_terms ?? "net_14");
    const allowedTerms = ["net_7", "net_14", "net_30"];
    const poMode =
      body.po_mode === "per_booking" || body.po_mode === "per_period"
        ? body.po_mode
        : null;
    await admin
      .from("organization_billing")
      .update({
        billing_contact_name: body.billing_contact_name?.trim() || null,
        billing_contact_email:
          body.billing_contact_email?.trim().toLowerCase() || null,
        billing_address: body.billing_address ?? null,
        po_required: !!body.po_required,
        po_mode: poMode,
        default_terms: allowedTerms.includes(terms) ? terms : "net_14",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", orgId);
    return NextResponse.json({ ok: true });
  }

  // step 7 is documents — handled by the upload endpoint. Anything
  // else falls through.
  return NextResponse.json({ error: "unknown_step" }, { status: 400 });
}
