import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const envPath = "/home/user/workspace/specialcarer/.env.local";
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const email = process.argv[2];
// Try 'email' type which is for OTP-only flow
const { data, error } = await admin.auth.admin.generateLink({ type: "email", email });
if (error) { console.error("ERR", error.message); process.exit(1); }
console.log(JSON.stringify(data.properties, null, 2));
