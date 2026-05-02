import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const email = String(formData.get("email") || "").trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.redirect(new URL("/?waitlist=invalid", req.url), { status: 303 });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("waitlist")
      .insert({ email, source: "homepage" });

    if (error && !error.message.includes("duplicate")) {
      console.error("Waitlist insert failed:", error);
      return NextResponse.redirect(new URL("/?waitlist=error", req.url), { status: 303 });
    }
  } catch (e) {
    console.error("Waitlist exception:", e);
    return NextResponse.redirect(new URL("/?waitlist=error", req.url), { status: 303 });
  }

  return NextResponse.redirect(new URL("/?waitlist=success", req.url), { status: 303 });
}
