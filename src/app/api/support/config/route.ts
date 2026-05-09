import { NextResponse } from "next/server";
import { getSupportConfig } from "@/lib/support/config";

export const dynamic = "force-dynamic";

/**
 * GET /api/support/config — anon-safe support hotline + insurance copy.
 * Server-side reads layer NEXT_PUBLIC_HOTLINE_PHONE_{UK,US} env-var
 * overrides on top of the support_settings row.
 */
export async function GET() {
  const config = await getSupportConfig();
  return NextResponse.json({ config });
}
