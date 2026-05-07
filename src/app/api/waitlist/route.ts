import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readPayload(
  req: NextRequest
): Promise<{ email: string; feature: string | null; isJson: boolean }> {
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    const json = (await req.json().catch(() => ({}))) as {
      email?: unknown;
      feature?: unknown;
    };
    return {
      email:
        typeof json.email === "string" ? json.email.trim().toLowerCase() : "",
      feature:
        typeof json.feature === "string" && json.feature.trim()
          ? json.feature.trim()
          : null,
      isJson: true,
    };
  }
  const form = await req.formData();
  const f = form.get("feature");
  return {
    email: String(form.get("email") || "").trim().toLowerCase(),
    feature: typeof f === "string" && f.trim() ? f.trim() : null,
    isJson: false,
  };
}

export async function POST(req: NextRequest) {
  const { email, feature, isJson } = await readPayload(req);

  if (!email || !EMAIL_RE.test(email)) {
    if (isJson) {
      return NextResponse.json(
        { ok: false, error: "invalid_email" },
        { status: 400 }
      );
    }
    return NextResponse.redirect(new URL("/?waitlist=invalid", req.url), {
      status: 303,
    });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("waitlist").insert({
      email,
      feature,
      source: feature ? `feature:${feature}` : "homepage",
    });

    if (error && !error.message.includes("duplicate")) {
      console.error("Waitlist insert failed:", error);
      if (isJson) {
        return NextResponse.json(
          { ok: false, error: "insert_failed" },
          { status: 500 }
        );
      }
      return NextResponse.redirect(new URL("/?waitlist=error", req.url), {
        status: 303,
      });
    }
  } catch (e) {
    console.error("Waitlist exception:", e);
    if (isJson) {
      return NextResponse.json(
        { ok: false, error: "server_error" },
        { status: 500 }
      );
    }
    return NextResponse.redirect(new URL("/?waitlist=error", req.url), {
      status: 303,
    });
  }

  if (isJson) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.redirect(new URL("/?waitlist=success", req.url), {
    status: 303,
  });
}
