/**
 * Apple Push Notification service (APNs) client.
 *
 * Sends pushes to iOS devices using HTTP/2 + a JWT signed with our team's
 * APNs auth key (.p8). One auth key is shared across all apps on the team;
 * the bundle ID determines which app the push targets.
 *
 * Required env vars (set on Vercel as encrypted secrets — never committed):
 *   APNS_TEAM_ID         e.g. 2HU3MZAKN7
 *   APNS_KEY_ID          e.g. ZGLGJUT336
 *   APNS_AUTH_KEY        the full PEM contents of AuthKey_<KEY_ID>.p8,
 *                        either inlined with literal \n or base64-encoded
 *                        (we accept both for ergonomics).
 *   APNS_BUNDLE_ID       com.allcare4ugroup.specialcarer
 *   APNS_USE_SANDBOX     "true" while building locally / on TestFlight,
 *                        unset (or "false") in production.
 *
 * Tokens are cached for ~50 minutes (Apple allows up to 60).
 */

import jwt from "jsonwebtoken";

const APNS_PROD = "api.push.apple.com";
const APNS_SANDBOX = "api.sandbox.push.apple.com";

let cachedToken: { value: string; expiresAt: number } | null = null;

function readPrivateKey(): string {
  const raw = process.env.APNS_AUTH_KEY;
  if (!raw) {
    throw new Error(
      "APNS_AUTH_KEY env var is missing. Paste the full PEM (including " +
        "BEGIN/END lines) or its base64 form into Vercel.",
    );
  }
  // Accept either inlined PEM (with literal \n) or base64-encoded PEM.
  if (raw.includes("BEGIN PRIVATE KEY")) {
    return raw.replace(/\\n/g, "\n");
  }
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    if (decoded.includes("BEGIN PRIVATE KEY")) return decoded;
  } catch {
    /* fall through */
  }
  throw new Error(
    "APNS_AUTH_KEY did not parse as PEM or base64-PEM. Re-paste the .p8 contents.",
  );
}

function getAuthToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return cachedToken.value;
  }

  const teamId = process.env.APNS_TEAM_ID;
  const keyId = process.env.APNS_KEY_ID;
  if (!teamId || !keyId) {
    throw new Error("APNS_TEAM_ID and APNS_KEY_ID env vars are required");
  }

  const privateKey = readPrivateKey();
  const token = jwt.sign({ iss: teamId, iat: now }, privateKey, {
    algorithm: "ES256",
    header: { alg: "ES256", kid: keyId },
  });

  // Apple lets a token live up to 1h; refresh at 50m.
  cachedToken = { value: token, expiresAt: now + 50 * 60 };
  return token;
}

export type ApnsPayload = {
  /** APS dictionary — alert, sound, badge, etc. */
  aps: {
    alert?:
      | string
      | {
          title?: string;
          subtitle?: string;
          body?: string;
        };
    sound?: string;
    badge?: number;
    "thread-id"?: string;
    "content-available"?: 1;
    "mutable-content"?: 1;
    category?: string;
  };
  /** Custom keys at the top level — read by the app. */
  [key: string]: unknown;
};

export type SendPushArgs = {
  /** Hex device token, 64 chars (or 160 chars for VoIP). */
  deviceToken: string;
  payload: ApnsPayload;
  /** Optional: priority (10 = immediate, 5 = power-conserving). */
  priority?: 5 | 10;
  /** Optional: expiration (unix seconds). 0 = drop if not deliverable now. */
  expiration?: number;
  /** Optional: collapse-id to deduplicate in Notification Center. */
  collapseId?: string;
  /** Optional: push type. Defaults to 'alert'. */
  pushType?: "alert" | "background" | "voip" | "complication" | "fileprovider";
};

export type SendPushResult =
  | { ok: true; apnsId: string }
  | { ok: false; status: number; reason: string };

export async function sendPush(args: SendPushArgs): Promise<SendPushResult> {
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (!bundleId) {
    throw new Error("APNS_BUNDLE_ID env var is required");
  }
  const useSandbox = process.env.APNS_USE_SANDBOX === "true";
  const host = useSandbox ? APNS_SANDBOX : APNS_PROD;

  const url = `https://${host}/3/device/${args.deviceToken}`;
  const token = getAuthToken();

  const headers: Record<string, string> = {
    authorization: `bearer ${token}`,
    "apns-topic": bundleId,
    "apns-push-type": args.pushType ?? "alert",
    "apns-priority": String(args.priority ?? 10),
    "content-type": "application/json",
  };
  if (args.expiration != null) {
    headers["apns-expiration"] = String(args.expiration);
  }
  if (args.collapseId) {
    headers["apns-collapse-id"] = args.collapseId;
  }

  // Node 18+ fetch supports HTTP/2 via the platform; on Vercel it's fine.
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(args.payload),
  });

  if (res.status === 200) {
    return { ok: true, apnsId: res.headers.get("apns-id") ?? "" };
  }

  let reason = res.statusText;
  try {
    const body = (await res.json()) as { reason?: string };
    if (body.reason) reason = body.reason;
  } catch {
    /* keep statusText */
  }

  // Per Apple's spec — 410 means token is invalid (user uninstalled the app
  // or revoked permissions). Caller should remove the token from the DB.
  return { ok: false, status: res.status, reason };
}
