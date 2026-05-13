// Mints a real Supabase session for a test user using admin verifyOtp, returns the cookie values
// the browser needs to be logged in.
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const envPath = "/home/user/workspace/specialcarer/.env.local";
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const email = process.argv[2];

// Step 1: generate a magic link, capture the hashed_token
const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
});
if (linkErr) { console.error("link err:", linkErr); process.exit(1); }

// Step 2: use the hashed_token + anon client to verify, which returns a real session
const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: sessionData, error: sessionErr } = await anon.auth.verifyOtp({
  token_hash: linkData.properties.hashed_token,
  type: "magiclink",
});
if (sessionErr) { console.error("verify err:", sessionErr); process.exit(1); }

const session = sessionData.session;
const user = sessionData.user;

// Print the cookie payload — Supabase Next.js SSR stores session as base64-encoded JSON in a cookie
// named sb-<project_ref>-auth-token. The format is: base64('{ "access_token":..., "refresh_token":..., ... }')
const projectRef = url.match(/https:\/\/(\w+)\.supabase/)[1];
const cookieName = `sb-${projectRef}-auth-token`;

const cookieValue = JSON.stringify({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_at: session.expires_at,
  expires_in: session.expires_in,
  token_type: "bearer",
  user,
});

console.log(JSON.stringify({
  user_id: user.id,
  email: user.email,
  cookie_name: cookieName,
  cookie_value_b64: "base64-" + Buffer.from(cookieValue).toString("base64"),
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  // The localStorage key Supabase JS uses by default
  localStorage_key: `sb-${projectRef}-auth-token`,
  localStorage_value: cookieValue,
}, null, 2));
