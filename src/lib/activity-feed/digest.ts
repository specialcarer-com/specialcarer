export type FeedEvent = {
  ts: string;
  event_type: string;
  event_data: Record<string, unknown>;
  booking_id: string | null;
};

export type FeedItem =
  | {
      kind: "event";
      ts: string;
      event_type: string;
      event_data: Record<string, unknown>;
      booking_id: string | null;
    }
  | {
      kind: "digest";
      ts: string;
      label: string;
      count: number;
      booking_id: string | null;
      children: FeedEvent[];
    };

/**
 * Collapse same-day, same-booking event clusters of 3+ into a single
 * digest row. Done in render-layer so the SQL view stays simple.
 *
 * Cluster key is (yyyy-mm-dd, booking_id, event_type) — checking in 4
 * times on the same booking on the same day rolls up; check-ins across
 * different bookings stay separate.
 */
export function buildFeed(events: FeedEvent[]): FeedItem[] {
  // Sort newest first.
  const sorted = [...events].sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
  );

  const groups = new Map<string, FeedEvent[]>();
  for (const e of sorted) {
    const day = e.ts.slice(0, 10);
    const key = `${day}::${e.booking_id ?? ""}::${e.event_type}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  // Track which groups produced digests so we skip the originals.
  const digested = new Set<string>();
  const out: FeedItem[] = [];

  for (const e of sorted) {
    const day = e.ts.slice(0, 10);
    const key = `${day}::${e.booking_id ?? ""}::${e.event_type}`;
    const cluster = groups.get(key) ?? [];
    if (cluster.length >= 3) {
      if (!digested.has(key)) {
        digested.add(key);
        out.push({
          kind: "digest",
          ts: cluster[0].ts,
          label: digestLabel(e.event_type, cluster.length),
          count: cluster.length,
          booking_id: e.booking_id,
          children: cluster,
        });
      }
      continue;
    }
    out.push({
      kind: "event",
      ts: e.ts,
      event_type: e.event_type,
      event_data: e.event_data,
      booking_id: e.booking_id,
    });
  }
  return out;
}

function digestLabel(eventType: string, count: number): string {
  switch (eventType) {
    case "carer_checked_in":
      return `Checked in ${count} times today`;
    case "carer_checked_out":
      return `Completed ${count} shifts today`;
    case "shift_time_adjusted":
      return `${count} time-adjustments today`;
    case "payment_settled":
      return `${count} bookings settled today`;
    default:
      return `${count} updates today`;
  }
}
