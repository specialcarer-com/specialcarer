import type { SendEmailInput, SendEmailResult } from "@/lib/email/smtp";

export type ReferenceResendDelivery =
  | { ok: true }
  | { ok: false; status: 500; error: string };

/**
 * Keeps resend routes consistent: a transport failure must be surfaced to the
 * caller and must not be followed by a token-rotation database update.
 */
export async function deliverReferenceResendEmail(
  send: (input: SendEmailInput) => Promise<SendEmailResult>,
  input: SendEmailInput,
): Promise<ReferenceResendDelivery> {
  const delivery = await send(input);
  return delivery.ok
    ? { ok: true }
    : { ok: false, status: 500, error: delivery.error };
}
