import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";

// Workers KV-backed incremental cache (ISR/data cache), bound as
// NEXT_INC_CACHE_KV in wrangler.jsonc. Persists across isolates/cold
// starts, unlike the prior no-op default. Tag cache and background
// revalidation queue selection remain a separate, later decision — see
// docs/cloudflare-hosting-portability.md. No paid resources beyond this
// single KV namespace are provisioned by this change.
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
