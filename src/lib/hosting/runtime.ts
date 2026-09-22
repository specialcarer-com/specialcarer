/**
 * Detects whether the current process is executing inside a Cloudflare
 * Workers runtime, as opposed to Node.js (Vercel, local dev).
 *
 * This is Cloudflare's own documented detection method: workerd sets
 * `navigator.userAgent` to the literal string "Cloudflare-Workers", which
 * no other runtime sets. It works at request time regardless of build-time
 * flags or bundler configuration, so it is safe to call from code shared
 * between the Vercel and Cloudflare builds.
 */
export function isCloudflareWorkersRuntime(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
}
