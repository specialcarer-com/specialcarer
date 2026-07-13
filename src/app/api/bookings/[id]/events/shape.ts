/**
 * Role-based projection for the GET /events response.
 *
 * Lives outside route.ts because a Next.js route module may only export
 * recognised handlers/config — a value export like this here fails the build's
 * route type check. Imported by both the route and its unit tests.
 *
 * The ops-internal verification fields (similarity score, override
 * attribution/reason, reviewer id, raw coordinates) are ONLY returned to
 * admins. Carers get the operational subset they need to render their own clock
 * card; families get just the visit timeline.
 */
import type { VisitEventRow } from "../clock/clock-handler";

export type Role = "admin" | "carer" | "family";

/** Project a full event row down to the fields a given role may see. */
export function shapeEvent(
  e: VisitEventRow,
  role: Role,
): Record<string, unknown> {
  if (role === "admin") return e;
  if (role === "family") {
    return {
      id: e.id,
      event_type: e.event_type,
      event_at: e.event_at,
    };
  }
  // carer — enough to drive their own clock card, no ops-internal fields.
  return {
    id: e.id,
    event_type: e.event_type,
    event_at: e.event_at,
    geofence_status: e.geofence_status,
    photo_verification_status: e.photo_verification_status,
  };
}
