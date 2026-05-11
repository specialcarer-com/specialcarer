import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminUser = {
  id: string;
  email: string | null;
};

/**
 * For use in server components and server actions inside /admin.
 * Middleware already redirects non-admins, but we double-check here for
 * defence-in-depth (middleware can be bypassed by direct RSC fetches).
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    redirect("/dashboard?forbidden=1");
  }
  return { id: user.id, email: user.email ?? null };
}

export type AdminApiGuardResult =
  | { ok: true; admin: AdminUser; response?: undefined }
  | { ok: false; admin?: undefined; response: NextResponse };

/**
 * For use in API route handlers under /api/admin/**.
 * Unlike requireAdmin() (which uses redirect() and is correct only for RSCs),
 * this returns a discriminated result so the caller can early-return a proper
 * 401 / 403 JSON response instead of throwing a NEXT_REDIRECT.
 *
 * Usage:
 *   const guard = await requireAdminApi();
 *   if (!guard.ok) return guard.response;
 *   const me = guard.admin;
 */
export async function requireAdminApi(): Promise<AdminApiGuardResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      ),
    };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, admin: { id: user.id, email: user.email ?? null } };
}

/**
 * Append a row to admin_audit_log. Never throws — logging must not break
 * the user-facing action. Best-effort.
 */
export async function logAdminAction(input: {
  admin: AdminUser;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}) {
  try {
    const admin = createAdminClient();
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip =
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        h.get("x-real-ip") ??
        null;
      userAgent = h.get("user-agent");
    } catch {
      // headers() unavailable in some contexts; ignore
    }
    await admin.from("admin_audit_log").insert({
      admin_id: input.admin.id,
      admin_email: input.admin.email,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      details: input.details ?? {},
      ip,
      user_agent: userAgent,
    });
  } catch (e) {
    // Best-effort — log to console but don't block.
    console.error("admin audit log failed", e);
  }
}
