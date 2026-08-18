import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Require the bearer token Vercel attaches to scheduled cron invocations.
 *
 * Vercel's documented cron authentication mechanism is CRON_SECRET in the
 * Authorization header. It does not provide a verifiable signed cron header,
 * so headers such as x-vercel-cron must not be trusted as authentication.
 */
export function requireCronAuth(req: NextRequest): NextResponse | null {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const authorization = req.headers.get("authorization");
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const suppliedSecret = authorization.slice(prefix.length);
  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);
  const isMatch =
    expected.length === supplied.length && timingSafeEqual(expected, supplied);

  if (!isMatch) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
