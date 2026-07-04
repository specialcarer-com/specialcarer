import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared gate for /admin/mfa/* — signed-in platform admins only (AAL2 not required).
 */
export default async function AdminMfaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "admin") {
    redirect("/dashboard?forbidden=1");
  }

  return <>{children}</>;
}
