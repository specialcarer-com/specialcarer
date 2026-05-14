import { cookies } from "next/headers";
import type { BannerVariant } from "./get";

/**
 * Cookie name pattern: sc_banner_<page_key_normalised>.
 * page_key contains a dot (e.g. "services.elderly_care") which is legal in
 * cookie names but we replace with _ for safety.
 */
export function cookieName(pageKey: string): string {
  return `sc_banner_${pageKey.replace(/\./g, "_")}`;
}

/**
 * Server-side variant selection.
 *
 *  - If the visitor's request carries the sc_banner_<page_key> cookie pointing
 *    to a valid index, return that variant (sticky per visit).
 *  - Otherwise, return null for the index so the client wrapper can pick a
 *    random index, render it, and write the cookie.
 *
 * Returning `pickedIndex = null` lets the client side own the first-visit
 * randomisation, which avoids hydration mismatches between SSR HTML and the
 * client (each SSR would otherwise render a different image).
 */
export async function getPickedVariantIndex(
  pageKey: string,
  variantCount: number,
): Promise<number | null> {
  if (variantCount <= 1) return 0;
  const store = await cookies();
  const raw = store.get(cookieName(pageKey))?.value;
  if (!raw) return null;
  const idx = Number.parseInt(raw, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= variantCount) return null;
  return idx;
}

export type ResolvedVariant = {
  variant: BannerVariant;
  index: number;
  /** True when SSR could not pick yet — client will hydrate and randomise. */
  needsClientPick: boolean;
};

export async function resolveVariant(
  pageKey: string,
  variants: BannerVariant[],
): Promise<ResolvedVariant> {
  const picked = await getPickedVariantIndex(pageKey, variants.length);
  if (picked == null) {
    // Default to variant 0 for SSR so we ship valid HTML, but flag that the
    // client should pick randomly and overwrite. The deterministic SSR pick
    // also ensures bots/crawlers see a consistent image.
    return { variant: variants[0], index: 0, needsClientPick: true };
  }
  return { variant: variants[picked], index: picked, needsClientPick: false };
}
