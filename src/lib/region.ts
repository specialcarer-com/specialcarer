// US region UI is hidden in production until the US launch (expected 2027).
// Set NEXT_PUBLIC_REGION_US_ENABLED="true" to expose US-only surfaces.
export const US_REGION_ENABLED =
  process.env.NEXT_PUBLIC_REGION_US_ENABLED === "true";
