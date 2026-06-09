/**
 * Pure handler for POST /api/m/me/online-status.
 *
 * Split from the route file so unit tests can drive the logic with a
 * stubbed RPC client (mirrors src/app/api/m/carers/search/search-handler.ts).
 *
 * The carer flips their own "Available now" flag (and optionally their
 * travel radius). All persistence goes through the SECURITY DEFINER RPC
 * `set_carer_online_status`, which writes only the calling user's row.
 */

export type OnlineStatusBody = {
  online?: unknown;
  radius_km?: unknown;
};

export type OnlineStatus = {
  is_online: boolean;
  last_online_at: string | null;
  online_radius_km: number;
};

export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 20;

export type ParsedOnlineStatus = {
  online: boolean;
  radius_km: number | null;
};

/**
 * Minimal slice of the Supabase client used by the handler — just the
 * `rpc` call. Lets tests stub without pulling in @supabase/supabase-js.
 */
export type OnlineStatusClient = {
  rpc(
    fn: "set_carer_online_status",
    args: { p_online: boolean; p_radius_km: number | null },
  ): Promise<{
    data: OnlineStatus[] | OnlineStatus | null;
    error: { message: string } | null;
  }>;
};

export function parseOnlineStatusBody(
  body: OnlineStatusBody,
): { ok: true; value: ParsedOnlineStatus } | { ok: false; error: string } {
  if (typeof body.online !== "boolean") {
    return { ok: false, error: "online must be a boolean" };
  }

  let radius_km: number | null = null;
  if (body.radius_km != null) {
    const n = Number(body.radius_km);
    if (!Number.isFinite(n)) {
      return { ok: false, error: "radius_km must be a number" };
    }
    // Clamp into [1, 20]. The RPC clamps too, but rejecting NaN early and
    // normalising here keeps the API contract clear.
    radius_km = Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.round(n)));
  }

  return { ok: true, value: { online: body.online, radius_km } };
}

function normaliseStatus(
  data: OnlineStatus[] | OnlineStatus | null,
): OnlineStatus | null {
  if (data == null) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    is_online: row.is_online === true,
    last_online_at: row.last_online_at ?? null,
    online_radius_km: Number(row.online_radius_km ?? MIN_RADIUS_KM),
  };
}

export async function handleOnlineStatus(args: {
  client: OnlineStatusClient;
  body: OnlineStatusBody;
}): Promise<
  | { status: 200; body: { status: OnlineStatus } }
  | { status: 400; body: { error: string } }
  | { status: 500; body: { error: string } }
> {
  const parsed = parseOnlineStatusBody(args.body);
  if (!parsed.ok) {
    return { status: 400, body: { error: parsed.error } };
  }

  const { data, error } = await args.client.rpc("set_carer_online_status", {
    p_online: parsed.value.online,
    p_radius_km: parsed.value.radius_km,
  });

  if (error) {
    return { status: 500, body: { error: error.message } };
  }

  const status = normaliseStatus(data);
  if (!status) {
    return { status: 500, body: { error: "no_caregiver_profile" } };
  }

  return { status: 200, body: { status } };
}
