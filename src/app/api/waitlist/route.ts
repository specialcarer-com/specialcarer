import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRequestIp } from "@/lib/rate-limit";
import { check as rlCheck } from "@/lib/rate-limit/distributed";
import { rateLimitHeaders } from "@/lib/rate-limit/headers";
import { waitlistEmail, waitlistIp } from "@/lib/rate-limit/keys";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** IP: 10 waitlist submits per hour (blast protection). */
const IP_LIMIT = 10;
/** Email: 5 submits per hour across IPs (per-address flood protection). */
const EMAIL_LIMIT = 5;
const HOUR_SEC = 60 * 60;

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

  // Distributed limiter (PR C2): IP bucket AND email bucket. Both must pass.
  // On over-limit → 429 with Retry-After + no DB write.
  const ip = getRequestIp(req);
  const ipCheck = await rlCheck({
    key: waitlistIp(ip),
    limit: IP_LIMIT,
    windowSec: HOUR_SEC,
  });
  if (!ipCheck.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(ipCheck) },
    );
  }
  const emailCheck = await rlCheck({
    key: waitlistEmail(email),
    limit: EMAIL_LIMIT,
    windowSec: HOUR_SEC,
  });
  if (!emailCheck.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(emailCheck) },
    );
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

  // Surface remaining budget on success too, so ops dashboards can log it.
  const headers = rateLimitHeaders(emailCheck);
  if (isJson) {
    return NextResponse.json({ ok: true }, { headers });
  }
  return NextResponse.redirect(new URL("/?waitlist=success", req.url), {
    status: 303,
    headers,
  });
}
