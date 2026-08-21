import { z } from "zod";

const refundRequestSchema = z
  .object({
    reason: z.unknown().optional(),
    amount_cents: z
      .number()
      .finite()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .optional(),
  })
  .passthrough();

export type ParsedRefundRequest = {
  reason: string | null;
  amountCents: number | undefined;
};

export function parseRefundRequest(body: unknown): ParsedRefundRequest | null {
  const parsed = refundRequestSchema.safeParse(body);
  if (!parsed.success) return null;
  return {
    reason:
      typeof parsed.data.reason === "string"
        ? parsed.data.reason.trim().slice(0, 500)
        : null,
    amountCents: parsed.data.amount_cents,
  };
}
