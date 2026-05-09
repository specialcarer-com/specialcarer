import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cms_faqs")
    .select(
      "id, category, question, answer_md, sort_order, audience",
    )
    .eq("status", "published")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json(
      { faqs: [], error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json(
    { faqs: data ?? [] },
    {
      headers: {
        "Cache-Control":
          "public, s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
