export type StripeWebhookEventRow = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
};

export type WebhookEventInsertResult = {
  id: string | null;
  error: string | null;
};

/**
 * Atomically insert a Stripe event log row. A null id means a concurrent or
 * prior delivery already owns the primary-keyed event and must not run effects.
 */
export async function claimStripeWebhookEvent(
  insertOnConflictDoNothing: (
    event: StripeWebhookEventRow,
  ) => Promise<WebhookEventInsertResult>,
  event: StripeWebhookEventRow,
): Promise<{ claimed: boolean; error: string | null }> {
  const result = await insertOnConflictDoNothing(event);
  if (result.error) return { claimed: false, error: result.error };
  return { claimed: result.id !== null, error: null };
}
