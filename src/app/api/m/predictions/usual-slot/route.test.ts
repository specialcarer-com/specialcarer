/**
 * Route-level tests for GET /api/m/predictions/usual-slot.
 *
 * Drives the pure `handleUsualSlot` with a stubbed UsualSlotClient + an
 * injected auth state, covering the documented status codes:
 *   - 401 when unauthenticated
 *   - 204 when there is no qualifying usual slot
 *   - 200 with the UsualSlot JSON when one is detected
 * (matches the pure-handler test pattern in this codebase.)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleUsualSlot } from "@/lib/predictions/usual-slot-handler";
import {
  type UsualSlotClient,
  type UsualSlot,
} from "@/lib/predictions/usualSlot";

type BookingRow = {
  id: string;
  caregiver_id: string | null;
  service_type: string | null;
  starts_at: string | null;
};

function makeClient(opts: {
  bookings: BookingRow[];
  names?: Record<string, string>;
}): UsualSlotClient {
  const names = opts.names ?? {};
  return {
    from(table: "bookings" | "caregiver_profiles" | "profiles") {
      if (table === "bookings") {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      gte() {
                        return {
                          async order() {
                            return { data: opts.bookings, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "caregiver_profiles") {
        return {
          select() {
            return {
              eq(_c: "user_id", id: string) {
                return {
                  async maybeSingle() {
                    const name = names[id];
                    return {
                      data: name ? { user_id: id, display_name: name } : null,
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: null, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as UsualSlotClient;
}

const SEEKER = "11111111-2222-3333-4444-555555555555";
const C1 = "aaaaaaaa-0000-0000-0000-000000000001";

describe("GET /api/m/predictions/usual-slot — handleUsualSlot", () => {
  it("401 when unauthenticated", async () => {
    const client = makeClient({ bookings: [] });
    const res = await handleUsualSlot({ userId: null, client });
    assert.equal(res.status, 401);
  });

  it("204 when there is no qualifying usual slot", async () => {
    const client = makeClient({ bookings: [] });
    const res = await handleUsualSlot({ userId: SEEKER, client });
    assert.equal(res.status, 204);
  });

  it("200 with the UsualSlot JSON when a slot is detected", async () => {
    // Two recent Tuesday-09:00 childcare bookings with C1.
    const recent = new Date();
    const d1 = new Date(recent);
    d1.setUTCDate(d1.getUTCDate() - 7);
    d1.setUTCHours(9, 0, 0, 0);
    const d2 = new Date(recent);
    d2.setUTCDate(d2.getUTCDate() - 14);
    d2.setUTCHours(9, 0, 0, 0);
    // Align both onto the same weekday.
    while (d1.getUTCDay() !== 2) d1.setUTCDate(d1.getUTCDate() - 1);
    while (d2.getUTCDay() !== 2) d2.setUTCDate(d2.getUTCDate() - 1);

    const bookings: BookingRow[] = [
      { id: "b1", caregiver_id: C1, service_type: "childcare", starts_at: d1.toISOString() },
      { id: "b2", caregiver_id: C1, service_type: "childcare", starts_at: d2.toISOString() },
    ];
    const client = makeClient({ bookings, names: { [C1]: "Sarah" } });
    const res = await handleUsualSlot({ userId: SEEKER, client });
    assert.equal(res.status, 200);
    const json = (await res.json()) as UsualSlot;
    assert.equal(json.carerId, C1);
    assert.equal(json.carerName, "Sarah");
    assert.equal(json.serviceType, "childcare");
    assert.equal(json.dayOfWeek, 2);
    assert.equal(json.startHour, 9);
    assert.equal(json.occurrences, 2);
  });
});
