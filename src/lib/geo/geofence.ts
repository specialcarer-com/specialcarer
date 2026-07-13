/**
 * Geofence evaluation for GPS clock-in (Sprint 4.5 v2).
 *
 * Pure + dependency-free so it is unit-testable and can run in any runtime.
 * The clock API calls this to decide whether a carer is close enough to the
 * client's address to clock in. Enforcement (the HARD 50 m block) lives in the
 * caller — this function only classifies and measures.
 */

export type Coords = { lat: number; lng: number };

/**
 * Geofence outcomes. Aligned 1:1 with the `visit_geofence_status` enum minus
 * `override` (which is only ever set by the admin override endpoint, not by an
 * automated evaluation).
 */
export type GeofenceStatus =
  | "passed"
  | "failed"
  | "no_client_address"
  | "no_carer_location";

export type GeofenceEvaluation = {
  status: GeofenceStatus;
  /** Great-circle distance in metres, or null when either side lacks coords. */
  distanceMetres: number | null;
  thresholdMetres: number;
  /**
   * True when the carer's device accuracy circle is wider than
   * LOW_ACCURACY_THRESHOLD_METRES. Advisory only — a large accuracy circle must
   * NOT auto-fail a legitimate visit, so this never changes `status`.
   */
  lowAccuracy: boolean;
};

/** The product policy: clock-in is blocked beyond this radius. */
export const DEFAULT_GEOFENCE_THRESHOLD_METRES = 50;

/** Above this device accuracy we flag a caveat but never auto-fail. */
export const LOW_ACCURACY_THRESHOLD_METRES = 100;

const EARTH_RADIUS_METRES = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function isValidCoords(c: Coords | null | undefined): c is Coords {
  return (
    c != null &&
    Number.isFinite(c.lat) &&
    Number.isFinite(c.lng) &&
    c.lat >= -90 &&
    c.lat <= 90 &&
    c.lng >= -180 &&
    c.lng <= 180
  );
}

/** Great-circle distance between two WGS84 points, in metres (Haversine). */
export function haversineMetres(a: Coords, b: Coords): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Classify a carer's reported location against the client's address.
 *
 * - No carer coords  → `no_carer_location` (should not happen; the API requires
 *   a fix, but handled for completeness).
 * - No client coords → `no_client_address` (data-quality flag; the caller still
 *   allows the clock-in).
 * - Within threshold  → `passed`.
 * - Beyond threshold  → `failed` (the caller turns this into a hard 409 block).
 */
export function evaluateGeofence(input: {
  carerCoords: Coords | null | undefined;
  clientCoords: Coords | null | undefined;
  thresholdMetres?: number;
  accuracyMetres?: number | null;
}): GeofenceEvaluation {
  const thresholdMetres =
    input.thresholdMetres ?? DEFAULT_GEOFENCE_THRESHOLD_METRES;
  const lowAccuracy =
    input.accuracyMetres != null &&
    Number.isFinite(input.accuracyMetres) &&
    input.accuracyMetres > LOW_ACCURACY_THRESHOLD_METRES;

  if (!isValidCoords(input.carerCoords)) {
    return {
      status: "no_carer_location",
      distanceMetres: null,
      thresholdMetres,
      lowAccuracy,
    };
  }
  if (!isValidCoords(input.clientCoords)) {
    return {
      status: "no_client_address",
      distanceMetres: null,
      thresholdMetres,
      lowAccuracy,
    };
  }

  const distanceMetres = haversineMetres(input.carerCoords, input.clientCoords);
  return {
    status: distanceMetres <= thresholdMetres ? "passed" : "failed",
    distanceMetres,
    thresholdMetres,
    lowAccuracy,
  };
}
