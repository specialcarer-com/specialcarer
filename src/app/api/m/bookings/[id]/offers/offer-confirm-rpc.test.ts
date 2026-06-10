/**
 * Behavioural tests for the offer→booking confirmation RPCs
 * (accept_match_offer / seeker_pick_offer), modelled as an in-memory
 * simulator that mirrors the SQL in
 * supabase/migrations/20260610_offer_accept_booking_confirm.sql.
 *
 * The simulator encodes the exact guards the SQL uses — the caregiver_id
 * IS NULL race winner check, the 60-minute Now/Scheduled split, and the
 * cancel-others fan-out — so these tests exercise the logic the database
 * will run. They are not a substitute for a live-DB check but pin the
 * algorithm: first-accept-wins, seeker-pick, lost-race, and RLS ownership.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

type BookingStatus =
  | "pending"
  | "pending_offer"
  | "offered"
  | "confirmed"
  | "cancelled";

type OfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | "accepted_and_confirmed"
  | "lost";

type Booking = {
  id: string;
  seeker_id: string;
  caregiver_id: string | null;
  status: BookingStatus;
  starts_at: number; // epoch ms
  confirmed_at: number | null;
};

type Offer = {
  id: string;
  booking_id: string;
  carer_id: string;
  status: OfferStatus;
  expires_at: number;
  cancel_reason: string | null;
};

const NOW = Date.parse("2026-06-09T12:00:00Z");
const PRE_CONFIRMED: BookingStatus[] = ["pending", "pending_offer", "offered"];

/** In-memory store with row-level "locking" simulated by sequential calls. */
class Store {
  bookings = new Map<string, Booking>();
  offers = new Map<string, Offer>();

  booking(b: Partial<Booking> & { id: string }): Booking {
    const row: Booking = {
      seeker_id: "seeker",
      caregiver_id: null,
      status: "pending",
      starts_at: NOW + 3 * 60 * 60 * 1000,
      confirmed_at: null,
      ...b,
    };
    this.bookings.set(row.id, row);
    return row;
  }

  offer(o: Partial<Offer> & { id: string; booking_id: string; carer_id: string }): Offer {
    const row: Offer = {
      status: "pending",
      expires_at: NOW + 60 * 60 * 1000,
      cancel_reason: null,
      ...o,
    };
    this.offers.set(row.id, row);
    return row;
  }

  // ── accept_match_offer(p_offer_id) as the carer `uid` ──────────────────
  acceptMatchOffer(offerId: string, uid: string, now = NOW) {
    const offer = this.offers.get(offerId);
    if (!offer) throw new Error("offer not found");
    if (offer.carer_id !== uid) throw new Error("not your offer");
    // Tapped Accept on an offer another carer just filled → friendly 'lost'.
    if (offer.status === "cancelled" && offer.cancel_reason === "filled_by_other_carer")
      return { result: "lost", booking_id: offer.booking_id, mode: "now" };
    if (offer.status !== "pending")
      return { result: "invalid_state", status: offer.status };
    if (offer.expires_at < now) {
      offer.status = "expired";
      return { result: "expired" };
    }
    const booking = this.bookings.get(offer.booking_id);
    if (!booking) throw new Error("booking not found");

    const isNow = booking.starts_at <= now + 60 * 60 * 1000;
    if (isNow) {
      // Atomic guarded update: only wins if no carer locked in + pre-confirmed.
      const canWin =
        booking.caregiver_id === null && PRE_CONFIRMED.includes(booking.status);
      if (!canWin) {
        offer.status = "lost";
        return { result: "lost", booking_id: booking.id, mode: "now" };
      }
      booking.caregiver_id = uid;
      booking.status = "confirmed";
      booking.confirmed_at = now;
      offer.status = "accepted_and_confirmed";
      for (const other of this.offers.values()) {
        if (
          other.booking_id === booking.id &&
          other.id !== offer.id &&
          (other.status === "pending" || other.status === "accepted")
        ) {
          other.status = "cancelled";
          other.cancel_reason = "filled_by_other_carer";
        }
      }
      return { result: "instant_confirm", booking_id: booking.id, mode: "now" };
    }
    // Scheduled: don't record a stale acceptance on an already-filled booking.
    if (booking.caregiver_id !== null || !PRE_CONFIRMED.includes(booking.status)) {
      offer.status = "lost";
      offer.cancel_reason = "filled_by_other_carer";
      return { result: "lost", booking_id: booking.id, mode: "scheduled" };
    }
    offer.status = "accepted";
    return { result: "pending_seeker_pick", booking_id: booking.id, mode: "scheduled" };
  }

  // ── seeker_pick_offer(p_offer_id) as the seeker `uid` ──────────────────
  seekerPickOffer(offerId: string, uid: string, now = NOW) {
    const offer = this.offers.get(offerId);
    if (!offer) throw new Error("offer not found");
    const booking = this.bookings.get(offer.booking_id);
    if (!booking) throw new Error("booking not found");
    if (booking.seeker_id !== uid) throw new Error("not your booking");
    if (offer.status !== "accepted" && offer.status !== "pending")
      return { result: "invalid_state", status: offer.status };
    if (booking.caregiver_id !== null || !PRE_CONFIRMED.includes(booking.status))
      return { result: "already_confirmed", booking_id: booking.id };

    booking.caregiver_id = offer.carer_id;
    booking.status = "confirmed";
    booking.confirmed_at = now;
    offer.status = "accepted_and_confirmed";
    for (const other of this.offers.values()) {
      if (
        other.booking_id === booking.id &&
        other.id !== offer.id &&
        (other.status === "pending" || other.status === "accepted")
      ) {
        other.status = "cancelled";
        other.cancel_reason = "filled_by_other_carer";
      }
    }
    return {
      result: "confirmed",
      booking_id: booking.id,
      carer_id: offer.carer_id,
      mode: "scheduled",
    };
  }
}

describe("accept_match_offer — instant (Now) mode", () => {
  it("5 offered, 2 accept: exactly 1 wins, 4 cancelled, booking confirmed to winner", () => {
    const s = new Store();
    const b = s.booking({ id: "b1", starts_at: NOW + 30 * 60 * 1000 }); // Now
    for (let i = 1; i <= 5; i++) {
      s.offer({ id: `o${i}`, booking_id: "b1", carer_id: `c${i}` });
    }

    // Two carers accept "simultaneously" — serialised by the booking row lock
    // in SQL. c2 commits first and sweeps the other four offers to cancelled;
    // c4's accept then lands on an already-filled offer and is told 'lost'.
    const r1 = s.acceptMatchOffer("o2", "c2");
    const r2 = s.acceptMatchOffer("o4", "c4");

    assert.equal(r1.result, "instant_confirm");
    assert.equal(r2.result, "lost");

    assert.equal(b.caregiver_id, "c2");
    assert.equal(b.status, "confirmed");
    assert.notEqual(b.confirmed_at, null);

    const offers = [...s.offers.values()];
    // Exactly one winner; the other four are cancelled with the fill reason.
    assert.equal(
      offers.filter((o) => o.status === "accepted_and_confirmed").length,
      1,
    );
    assert.equal(offers.find((o) => o.id === "o2")!.status, "accepted_and_confirmed");
    const cancelled = offers.filter((o) => o.status === "cancelled");
    assert.equal(cancelled.length, 4);
    assert.ok(cancelled.every((o) => o.cancel_reason === "filled_by_other_carer"));
  });

  it("late accept after a confirm gets 'lost' (race)", () => {
    const s = new Store();
    s.booking({ id: "b1", starts_at: NOW + 10 * 60 * 1000 });
    s.offer({ id: "oA", booking_id: "b1", carer_id: "A" });
    s.offer({ id: "oB", booking_id: "b1", carer_id: "B" });

    const a = s.acceptMatchOffer("oA", "A");
    const bResp = s.acceptMatchOffer("oB", "B");

    assert.equal(a.result, "instant_confirm");
    assert.equal(bResp.result, "lost");
    assert.equal(s.bookings.get("b1")!.caregiver_id, "A");
  });

  it("expired offer cannot be accepted", () => {
    const s = new Store();
    s.booking({ id: "b1", starts_at: NOW + 10 * 60 * 1000 });
    s.offer({ id: "o1", booking_id: "b1", carer_id: "c1", expires_at: NOW - 1 });
    const r = s.acceptMatchOffer("o1", "c1");
    assert.equal(r.result, "expired");
    assert.equal(s.bookings.get("b1")!.status, "pending");
  });
});

describe("accept_match_offer + seeker_pick_offer — scheduled mode", () => {
  it("5 offered, 3 accept, booking stays pending; seeker picks 1, others cancelled", () => {
    const s = new Store();
    const b = s.booking({ id: "b1", seeker_id: "S", starts_at: NOW + 5 * 60 * 60 * 1000 });
    for (let i = 1; i <= 5; i++) {
      s.offer({ id: `o${i}`, booking_id: "b1", carer_id: `c${i}` });
    }

    const a1 = s.acceptMatchOffer("o1", "c1");
    const a2 = s.acceptMatchOffer("o2", "c2");
    const a3 = s.acceptMatchOffer("o3", "c3");
    assert.equal(a1.result, "pending_seeker_pick");
    assert.equal(a2.result, "pending_seeker_pick");
    assert.equal(a3.result, "pending_seeker_pick");

    // Booking untouched while the seeker decides.
    assert.equal(b.caregiver_id, null);
    assert.equal(b.status, "pending");
    assert.equal([...s.offers.values()].filter((o) => o.status === "accepted").length, 3);

    // Seeker confirms c2.
    const pick = s.seekerPickOffer("o2", "S");
    assert.equal(pick.result, "confirmed");
    assert.equal(b.caregiver_id, "c2");
    assert.equal(b.status, "confirmed");

    const offers = [...s.offers.values()];
    assert.equal(offers.find((o) => o.id === "o2")!.status, "accepted_and_confirmed");
    // o1, o3 were accepted → cancelled; o4, o5 were pending → cancelled.
    assert.equal(offers.filter((o) => o.status === "cancelled").length, 4);
  });

  it("re-picking a swept offer after confirm is rejected (invalid_state)", () => {
    const s = new Store();
    s.booking({ id: "b1", seeker_id: "S", starts_at: NOW + 5 * 60 * 60 * 1000 });
    s.offer({ id: "o1", booking_id: "b1", carer_id: "c1" });
    s.offer({ id: "o2", booking_id: "b1", carer_id: "c2" });
    s.acceptMatchOffer("o1", "c1");
    s.acceptMatchOffer("o2", "c2");
    assert.equal(s.seekerPickOffer("o1", "S").result, "confirmed");
    // o2 was swept to 'cancelled' by the confirm, so it is no longer pickable.
    const second = s.seekerPickOffer("o2", "S");
    assert.equal(second.result, "invalid_state");
  });

  it("picking a straggler still-accepted offer on a confirmed booking is rejected (already_confirmed)", () => {
    // Models a race where an offer escaped the cancel-sweep but the booking is
    // already confirmed — the booking-state guard, not the offer-state guard,
    // must reject the pick.
    const s = new Store();
    const b = s.booking({ id: "b1", seeker_id: "S", starts_at: NOW + 5 * 60 * 60 * 1000 });
    s.offer({ id: "o1", booking_id: "b1", carer_id: "c1" });
    s.acceptMatchOffer("o1", "c1");
    assert.equal(s.seekerPickOffer("o1", "S").result, "confirmed");
    // A straggler offer that is still 'accepted' on the now-confirmed booking.
    const straggler = s.offer({ id: "o9", booking_id: "b1", carer_id: "c9" });
    straggler.status = "accepted";
    assert.equal(b.status, "confirmed");
    const res = s.seekerPickOffer("o9", "S");
    assert.equal(res.result, "already_confirmed");
  });
});

describe("seeker_pick_offer — RLS ownership", () => {
  it("seeker B cannot pick on seeker A's booking", () => {
    const s = new Store();
    s.booking({ id: "b1", seeker_id: "A", starts_at: NOW + 5 * 60 * 60 * 1000 });
    s.offer({ id: "o1", booking_id: "b1", carer_id: "c1" });
    s.acceptMatchOffer("o1", "c1");
    assert.throws(() => s.seekerPickOffer("o1", "B"), /not your booking/);
    // Booking untouched.
    assert.equal(s.bookings.get("b1")!.caregiver_id, null);
  });

  it("a carer cannot accept another carer's offer", () => {
    const s = new Store();
    s.booking({ id: "b1", starts_at: NOW + 10 * 60 * 1000 });
    s.offer({ id: "o1", booking_id: "b1", carer_id: "c1" });
    assert.throws(() => s.acceptMatchOffer("o1", "intruder"), /not your offer/);
  });
});
