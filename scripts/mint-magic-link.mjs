import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve("/home/user/workspace/specialcarer/.env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const email = process.argv[2];
if (!email) { console.error("usage: node mint-magic-link.mjs <email>"); process.exit(1); }

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: "https://specialcarer.com/dashboard" },
});

if (error) { console.error("ERROR:", error.message); process.exit(1); }
console.log("ACTION_LINK:", data.properties.action_link);
console.log("HASHED_TOKEN:", data.properties.hashed_token);
console.log("EMAIL_OTP:", data.properties.email_otp);
