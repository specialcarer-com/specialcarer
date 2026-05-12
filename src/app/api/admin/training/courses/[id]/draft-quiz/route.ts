import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/training/courses/[id]/draft-quiz
 * Body: { count?: number, transcript?: string }
 *
 * Returns AI-suggested questions for the admin to edit before saving via
 * PUT .../questions. The codebase has no LLM client wired up (src/lib/ai
 * is heuristic-only, no Anthropic/OpenAI SDK), so we return 501 with a
 * helpful message. The admin can still author questions manually.
 */
export async function POST(
  _req: Request,
  { params: _params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdminApi();
  if (!guard.ok) return guard.response;
  // Drain params so Next.js doesn't warn — we don't need the id.
  await _params;

  return NextResponse.json(
    {
      error: "Not implemented",
      message:
        "AI question drafting is not wired up: this codebase has no LLM client (Anthropic / OpenAI) configured. Author quiz questions manually via the inline editor below.",
    },
    { status: 501 },
  );
}
