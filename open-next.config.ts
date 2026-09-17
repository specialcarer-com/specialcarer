import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Compatibility preview only. Persistent cache bindings must be selected
// and verified before production cutover; no paid resources are provisioned.
export default defineCloudflareConfig();
