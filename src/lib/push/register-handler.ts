/**
 * Pure handler for /api/m/push/register and /api/m/push/unregister.
 *
 * Split out from the route file so unit tests can drive the logic with a
 * stubbed Supabase client (matches the convention used elsewhere in the
 * repo — see src/lib/admin/training-handlers.ts).
 */
import { NextResponse } from "next/server";
import type { PushPlatform } from "@/lib/push/tokens";

const ALLOWED_PLATFORMS: ReadonlyArray<PushPlatform> = ["ios", "android", "web"];

type UpsertRow = {
  user_id: string;
  platform: PushPlatform;
  token: string;
  device_id: string | null;
  app_version: string | null;
  last_seen_at: string;
  revoked_at: null;
};

type UpdateRow = {
  revoked_at: string;
};

/**
 * Minimal interface of the Supabase client we touch. Mirrors the shape
 * returned by createAdminClient() / createClient() so tests can stub it
 * without pulling in the full @supabase/supabase-js types.
 */
export type PushTokenClient = {
  from(table: "push_tokens"): {
    upsert(
      row: UpsertRow,
      opts: { onConflict: string },
    ): {
      select(cols: string): {
        single(): Promise<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
    update(row: UpdateRow): {
      eq(
        col: "token",
        value: string,
      ): {
        eq(
          col: "user_id",
          value: string,
        ): Promise<{ error: { message: string } | null }>;
      };
    };
  };
};

export type RegisterBody = {
  platform?: unknown;
  token?: unknown;
  device_id?: unknown;
  app_version?: unknown;
};

function isPlatform(v: unknown): v is PushPlatform {
  return typeof v === "string" && (ALLOWED_PLATFORMS as readonly string[]).includes(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isOptionalString(v: unknown): v is string | undefined | null {
  return v == null || typeof v === "string";
}

export async function handleRegister(args: {
  user_id: string;
  client: PushTokenClient;
  body: RegisterBody;
}): Promise<NextResponse> {
  const { user_id, client, body } = args;

  if (!isPlatform(body.platform)) {
    return NextResponse.json(
      { error: "platform must be one of ios, android, web" },
      { status: 400 },
    );
  }
  if (!isNonEmptyString(body.token)) {
    return NextResponse.json(
      { error: "token is required" },
      { status: 400 },
    );
  }
  if (!isOptionalString(body.device_id)) {
    return NextResponse.json(
      { error: "device_id must be a string" },
      { status: 400 },
    );
  }
  if (!isOptionalString(body.app_version)) {
    return NextResponse.json(
      { error: "app_version must be a string" },
      { status: 400 },
    );
  }

  const row: UpsertRow = {
    user_id,
    platform: body.platform,
    token: body.token,
    device_id: typeof body.device_id === "string" ? body.device_id : null,
    app_version: typeof body.app_version === "string" ? body.app_version : null,
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
  };

  const { data, error } = await client
    .from("push_tokens")
    .upsert(row, { onConflict: "user_id,token" })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id ?? null });
}

export async function handleUnregister(args: {
  user_id: string;
  client: PushTokenClient;
  body: { token?: unknown };
}): Promise<NextResponse> {
  const { user_id, client, body } = args;

  if (!isNonEmptyString(body.token)) {
    return NextResponse.json(
      { error: "token is required" },
      { status: 400 },
    );
  }

  const { error } = await client
    .from("push_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", body.token)
    .eq("user_id", user_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
