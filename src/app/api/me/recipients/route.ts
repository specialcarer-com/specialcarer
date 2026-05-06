import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createRecipient,
  listMyRecipients,
} from "@/lib/recipients/server";
import type { RecipientCreateInput, RecipientKind } from "@/lib/recipients/types";

export const dynamic = "force-dynamic";

const VALID_KINDS: RecipientKind[] = ["child", "senior", "home"];

/** GET /api/me/recipients → all recipients visible to current user */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const recipients = await listMyRecipients();
  return NextResponse.json({ recipients });
}

/** POST /api/me/recipients → create a new recipient */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: RecipientCreateInput | null = null;
  try {
    body = (await req.json()) as RecipientCreateInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json({ error: "Missing body" }, { status: 400 });
  }
  if (!VALID_KINDS.includes(body.kind)) {
    return NextResponse.json({ error: "Invalid recipient kind" }, { status: 400 });
  }

  const result = await createRecipient(user.id, body.kind, body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ recipient: result.recipient }, { status: 201 });
}
