/**
 * Tunable constants for visit verification (Sprint 4.5 v2).
 */

/**
 * Cosine-similarity threshold for the carer selfie-vs-reference photo match.
 *
 * DEFERRED: the automated match engine is not shipped in this PR (the
 * vendor/cost decision — Veriff extension vs in-house embedding — is still
 * open). This constant is defined now so the future engine and the ops UI share
 * one source of truth, and no schema/config change is needed when it lands.
 *
 * Tuning strategy: start conservative at 0.65 (advisory only — a `failed` match
 * never blocks clock-in, it only flags the event for ops review). Once we have
 * ~100 real events with human-labelled outcomes, raise the threshold to cut
 * false-positives (a genuine carer wrongly flagged) rather than chasing recall,
 * since the geofence is the actual security control and the photo is a
 * secondary, human-reviewed signal.
 */
export const PHOTO_MATCH_THRESHOLD = 0.65;
