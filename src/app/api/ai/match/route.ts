import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  rankCaregiversForSeeker,
  getCachedMatches,
} from "@/lib/ai/matching";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/ai/match
 * Body: { service_type: string, candidate_ids?: string[] }
 * Returns ranked list for the calling user (must be signed in).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const serviceType =
    typeof p.service_type === "string" ? p.service_type : "";
  if (!serviceType) {
    return NextResponse.json(
      { error: "missing_service_type" },
      { status: 400 },
    );
  }
  const candidateIds = Array.isArray(p.candidate_ids)
    ? (p.candidate_ids as unknown[]).filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      )
    : undefined;

  const matches = await rankCaregiversForSeeker({
    seekerId: user.id,
    serviceType,
    candidateIds,
  });
  return NextResponse.json({ matches });
}

/**
 * GET /api/ai/match?service_type=…
 * Returns cached scores for the calling seeker.
 */
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const url = new URL(req.url);
  const serviceType = url.searchParams.get("service_type") ?? "";
  if (!serviceType) {
    return NextResponse.json(
      { error: "missing_service_type" },
      { status: 400 },
    );
  }
  const limit = Math.max(
    1,
    Math.min(50, Number(url.searchParams.get("limit") ?? "10")),
  );
  const matches = await getCachedMatches(user.id, serviceType, limit);
  return NextResponse.json({ matches });
}
