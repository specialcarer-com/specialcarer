/**
 * Thin wrapper around the Expo Push HTTP API.
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * - Chunks into batches of 100 (Expo's per-request limit).
 * - If `EXPO_ACCESS_TOKEN` is set, sends the enhanced-security bearer header.
 * - Native fetch only — no SDK dependency.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  ttl?: number;
};

export type ExpoPushErrorCode =
  | "DeviceNotRegistered"
  | "InvalidCredentials"
  | "MessageTooBig"
  | "MessageRateExceeded"
  | "MismatchSenderId";

export type ExpoPushTicket =
  | { status: "ok"; id: string }
  | {
      status: "error";
      message: string;
      details?: { error?: ExpoPushErrorCode };
    };

export type ExpoPushResponse = {
  data: ExpoPushTicket[];
  errors?: Array<{ code: string; message: string }>;
};

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function sendExpoPush(
  messages: ExpoPushMessage[],
): Promise<ExpoPushResponse> {
  if (messages.length === 0) return { data: [] };

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (accessToken && accessToken.length > 0) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const combined: ExpoPushTicket[] = [];
  const allErrors: Array<{ code: string; message: string }> = [];

  for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(batch),
    });
    const json = (await res.json()) as ExpoPushResponse;
    if (Array.isArray(json.data)) combined.push(...json.data);
    if (Array.isArray(json.errors)) allErrors.push(...json.errors);
  }

  const out: ExpoPushResponse = { data: combined };
  if (allErrors.length > 0) out.errors = allErrors;
  return out;
}
