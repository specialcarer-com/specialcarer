export const PAYMENT_CAPTURE_CLAIM_TTL_MS = 10 * 60 * 1000;

/**
 * A stale claim is safe to reclaim after a crashed or timed-out cron. Fresh
 * claims are owned by the cron invocation that wrote them.
 */
export function isCaptureClaimAvailable(
  processingStartedAt: string | null,
  now: Date,
): boolean {
  if (!processingStartedAt) return true;
  const startedAt = Date.parse(processingStartedAt);
  return (
    Number.isFinite(startedAt) &&
    startedAt < now.getTime() - PAYMENT_CAPTURE_CLAIM_TTL_MS
  );
}

export function paymentCaptureClaimFilter(now = new Date()): string {
  return `processing_started_at.is.null,processing_started_at.lt.${new Date(
    now.getTime() - PAYMENT_CAPTURE_CLAIM_TTL_MS,
  ).toISOString()}`;
}

export type AtomicClaim = () => Promise<string | null>;

/**
 * Run work only for a row which the caller atomically claimed in the database.
 * The concrete UPDATE ... RETURNING query stays close to its table-specific
 * route code while this small unit makes the no-side-effect invariant explicit.
 */
export async function processClaimedCapture(
  claim: AtomicClaim,
  process: (id: string) => Promise<void>,
): Promise<"claimed" | "skipped"> {
  const id = await claim();
  if (!id) return "skipped";
  await process(id);
  return "claimed";
}
