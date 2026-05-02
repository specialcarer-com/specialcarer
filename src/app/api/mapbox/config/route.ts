import { NextResponse } from "next/server";
import { getPublicToken, getStyle, isStubMode } from "@/lib/mapbox/server";

export const runtime = "nodejs";

/**
 * GET /api/mapbox/config
 *
 * Returns the public Mapbox token + style URL for the browser to render maps.
 * The public token (pk.*) is safe to expose. Returns stub:true if no real
 * token is configured — the client should render a fallback list view.
 */
export async function GET() {
  return NextResponse.json({
    token: getPublicToken(),
    style: getStyle(),
    stub: isStubMode() || !getPublicToken(),
  });
}
