/**
 * Load the coarse postcode hint without letting a failure sink the clock-in.
 *
 * Lives outside route.ts because a Next.js route module may only export
 * recognised handlers/config — a value export like this in the route file fails
 * the build's route type check. Imported by both the route and its unit tests.
 *
 * The hint only ever decorates a geofence-failure message, so a read error
 * degrades to `null` rather than bubbling to a 500 (#6).
 */
export async function readPostcodeHint(
  fetchPostcode: () => Promise<string | null>,
): Promise<string | null> {
  try {
    return await fetchPostcode();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[clock] postcode hint unavailable", msg);
    return null;
  }
}
