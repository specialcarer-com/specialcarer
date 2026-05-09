import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/cms/posts/active — published posts only.
 * Public read; relies on the cms_posts public-select-published RLS policy.
 */
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cms_posts")
    .select(
      "id, slug, title, excerpt, hero_image_url, audience, tags, published_at",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(200);
  if (error) {
    return NextResponse.json(
      { posts: [], error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json(
    { posts: data ?? [] },
    {
      headers: {
        "Cache-Control":
          "public, s-maxage=60, stale-while-revalidate=600",
      },
    },
  );
}
