import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SupportConfig } from "@/lib/safety/types";

/**
 * Read the singleton support_settings row, then layer env-var
 * overrides for the public hotline numbers so an ops change doesn't
 * require a migration.
 */
export async function getSupportConfig(): Promise<SupportConfig> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_settings")
    .select(
      "hotline_phone_uk, hotline_phone_us, hotline_hours, support_email, chat_enabled, chat_url, insurance_summary_md, worker_protection_md",
    )
    .eq("singleton", true)
    .maybeSingle<SupportConfig>();

  const dbUk = data?.hotline_phone_uk ?? "+44 800 000 0000";
  const dbUs = data?.hotline_phone_us ?? "+1 800-000-0000";
  const envUk = process.env.NEXT_PUBLIC_HOTLINE_PHONE_UK?.trim() || null;
  const envUs = process.env.NEXT_PUBLIC_HOTLINE_PHONE_US?.trim() || null;

  return {
    hotline_phone_uk: envUk || dbUk,
    hotline_phone_us: envUs || dbUs,
    hotline_hours: data?.hotline_hours ?? "24/7",
    support_email: data?.support_email ?? "support@specialcarer.com",
    chat_enabled: data?.chat_enabled ?? false,
    chat_url: data?.chat_url ?? null,
    insurance_summary_md: data?.insurance_summary_md ?? "",
    worker_protection_md: data?.worker_protection_md ?? "",
  };
}
