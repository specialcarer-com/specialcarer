import type { ImageLoaderProps } from "next/image";

/**
 * No-op image loader, used only for the Cloudflare build (see
 * next.config.ts).
 *
 * A custom loader — not `images.unoptimized` — is required here. Setting
 * `unoptimized: true` alone still leaves Next's built-in image-optimization
 * API route (`/_next/image`) in the build; that route has a conditional
 * `require("sharp")` for the case where optimization *is* wanted. Sharp
 * ships per-platform native `.node` binaries, and OpenNext's Cloudflare
 * bundling pass (esbuild) cannot resolve them — confirmed against a real
 * `cf:build` run, which failed on exactly this. `serverExternalPackages`
 * does not help either: it only affects Next's Server Components bundling
 * boundary, and this route is not a Server Component.
 *
 * A custom loader sidesteps the problem structurally rather than trying to
 * persuade the bundler to ignore a reachable reference: Next calls this
 * function directly and never proxies through `/_next/image`, so the
 * built-in optimizer — and therefore sharp — is never part of the build at
 * all. This returns the source URL unmodified, i.e. the same "serve as-is,
 * no optimization" outcome `unoptimized: true` was meant to provide, via a
 * path that doesn't pull in sharp.
 */
export default function identityLoader({ src }: ImageLoaderProps): string {
  return src;
}
