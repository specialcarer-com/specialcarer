import { createAdminClient } from "@/lib/supabase/admin";

export type WebhookVendor = "stripe" | "uchecks" | "checkr";

export type AdminWebhookRow = {
  vendor: WebhookVendor;
  event_id: string;
  event_type: string;
  received_at: string;
  processed_at: string | null;
  error: string | null;
  payload: Record<string, unknown>;
};

export type WebhooksFilter = {
  vendor?: WebhookVendor | "all";
  state?: "all" | "processed" | "errored" | "unprocessed";
  q?: string; // event_id substring or type substring
};

const PAGE_SIZE = 50;

export async function listWebhookEvents(
  filter: WebhooksFilter,
  page = 1,
): Promise<{ rows: AdminWebhookRow[]; total: number; totalPages: number }> {
  const admin = createAdminClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let q = admin
    .from("admin_webhook_events")
    .select("*", { count: "exact" })
    .order("received_at", { ascending: false })
    .range(from, to);

  if (filter.vendor && filter.vendor !== "all") q = q.eq("vendor", filter.vendor);
  if (filter.state === "processed") q = q.not("processed_at", "is", null).is("error", null);
  if (filter.state === "errored") q = q.not("error", "is", null);
  if (filter.state === "unprocessed") q = q.is("processed_at", null);
  if (filter.q) {
    // OR across event_id and event_type
    q = q.or(`event_id.ilike.%${filter.q}%,event_type.ilike.%${filter.q}%`);
  }

  const { data, count } = await q;
  const rows = (data ?? []) as AdminWebhookRow[];
  return {
    rows,
    total: count ?? 0,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}
