import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  deleteRecipient,
  getRecipient,
  updateRecipient,
} from "@/lib/recipients/server";
import type { RecipientUpdateInput } from "@/lib/recipients/types";

export const dynamic = "force-dynamic";

/** GET /api/me/recipients/[id] */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const recipient = await getRecipient(id);
  if (!recipient) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ recipient });
}

/** PATCH /api/me/recipients/[id] */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: RecipientUpdateInput | null = null;
  try {
    body = (await req.json()) as RecipientUpdateInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json({ error: "Missing body" }, { status: 400 });
  }

  const result = await updateRecipient(user.id, id, body);
  if (!result.ok) {
    const status = result.error === "Not found" ? 404
      : result.error === "Not authorised" ? 403
      : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ recipient: result.recipient });
}

/** DELETE /api/me/recipients/[id] */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await deleteRecipient(user.id, id);
  if (!result.ok) {
    const status = result.error === "Not found" ? 404
      : result.error === "Not authorised" ? 403
      : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
