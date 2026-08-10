import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  consentPdfErrorMessage,
  generateAndStoreConsentPdf,
  markConsentPdfFailed,
} from "@/lib/references/consent-pdf";
import {
  normaliseNationalInsuranceNumber,
  UK_NI_RE,
  type ReferenceConsent,
} from "@/lib/references/consent";

export const dynamic = "force-dynamic";

type Body = {
  full_name?: string;
  date_of_birth?: string;
  national_insurance_number?: string;
  signature_data_url?: string;
};

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

type ConsentPostDependencies = {
  getSession: typeof session;
  generatePdf: typeof generateAndStoreConsentPdf;
  markFailed: typeof markConsentPdfFailed;
};

export async function GET() {
  const { supabase, user } = await session();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("carer_reference_consents")
    .select("*")
    .eq("carer_id", user.id)
    .maybeSingle<ReferenceConsent>();
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ consent: data });
}

export function createConsentPostHandler(
  dependencies: Partial<ConsentPostDependencies> = {}
) {
  const {
    getSession = session,
    generatePdf = generateAndStoreConsentPdf,
    markFailed = markConsentPdfFailed,
  } = dependencies;

  return async function POST(req: Request) {
    const { supabase, user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const fullName =
      typeof body.full_name === "string" ? body.full_name.trim() : "";
    const dob =
      typeof body.date_of_birth === "string" ? body.date_of_birth : "";
    const ni = normaliseNationalInsuranceNumber(
      typeof body.national_insurance_number === "string"
        ? body.national_insurance_number
        : ""
    );
    const signature =
      typeof body.signature_data_url === "string"
        ? body.signature_data_url
        : "";
    if (fullName.length < 1 || fullName.length > 120) {
      return NextResponse.json(
        { error: "Full legal name is required" },
        { status: 400 }
      );
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dob) ||
      Number.isNaN(new Date(`${dob}T00:00:00Z`).getTime())
    ) {
      return NextResponse.json(
        { error: "A valid date of birth is required" },
        { status: 400 }
      );
    }
    if (!UK_NI_RE.test(ni)) {
      return NextResponse.json(
        { error: "Enter a valid National Insurance number" },
        { status: 400 }
      );
    }
    if (
      !signature.startsWith("data:image/png;base64,") ||
      signature.length > 200000
    ) {
      return NextResponse.json(
        { error: "A signature is required" },
        { status: 400 }
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      null;
    const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;
    const { data, error } = await supabase
      .from("carer_reference_consents")
      .upsert(
        {
          carer_id: user.id,
          full_name: fullName,
          date_of_birth: dob,
          national_insurance_number: ni,
          signature_data_url: signature,
          signed_at: new Date().toISOString(),
          signed_ip: ip,
          signed_ua: ua,
          revoked_at: null,
          pdf_storage_path: null,
          consent_pdf_status: "pending",
          consent_pdf_error: null,
        },
        { onConflict: "carer_id" }
      )
      .select("*")
      .single<ReferenceConsent>();
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? "Unable to save consent" },
        { status: 500 }
      );
    }

    try {
      const consent = await generatePdf(data);
      return NextResponse.json({ consent });
    } catch (generationError) {
      const failure = await markFailed(data.id, generationError);
      if (failure.error) {
        console.error(
          "[reference-consents] could not record PDF generation failure",
          failure.error
        );
      }
      console.error(
        "[reference-consents] PDF generation failed",
        generationError
      );
      return NextResponse.json(
        {
          error: "Unable to generate consent PDF",
          consent: failure.consent ?? {
            ...data,
            consent_pdf_status: "failed" as const,
            consent_pdf_error: consentPdfErrorMessage(generationError),
          },
        },
        { status: 500 }
      );
    }
  };
}

export const POST = createConsentPostHandler();

export async function DELETE() {
  const { supabase, user } = await session();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { error } = await supabase
    .from("carer_reference_consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("carer_id", user.id)
    .is("revoked_at", null);
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}
