import { NextResponse } from "next/server";
import { requireAdmin, logAdminAction } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cms_faqs")
    .select(
      "id, category, question, answer_md, sort_order, audience, status, updated_at",
    )
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ faqs: data ?? [] });
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const p = (body ?? {}) as Record<string, unknown>;
  const category = typeof p.category === "string" ? p.category.trim() : "";
  const question = typeof p.question === "string" ? p.question.trim() : "";
  const answer = typeof p.answer_md === "string" ? p.answer_md : "";
  const sortOrder = typeof p.sort_order === "number" ? p.sort_order : 0;
  const status = typeof p.status === "string" ? p.status : "published";
  const audience = Array.isArray(p.audience)
    ? p.audience.filter((x): x is string => typeof x === "string")
    : [];
  if (!category || !question) {
    return NextResponse.json(
      { error: "missing_category_or_question" },
      { status: 400 },
    );
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cms_faqs")
    .insert({
      category,
      question,
      answer_md: answer,
      sort_order: sortOrder,
      status,
      audience,
    })
    .select("id, category, question, sort_order, status")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  await logAdminAction({
    admin: me,
    action: "cms_faq.create",
    targetType: "cms_faq",
    targetId: data.id,
    details: { category, question },
  });
  return NextResponse.json({ faq: data });
}
