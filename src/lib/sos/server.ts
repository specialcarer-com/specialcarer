/**
 * Server-side SOS helpers: insert the alert + best-effort notify admin
 * and the booking counterpart by email. Email failures must never block
 * the underlying SOS write — we always fire-and-forget.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/smtp";
import { SOS_NOTE_MAX, type SosAlert } from "./types";

export type RaiseSosInput = {
  bookingId?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  note?: string | null;
};

export type RaiseSosResult =
  | { ok: true; alert: SosAlert }
  | { ok: false; error: string; status?: number };

const ADMIN_EMAIL =
  process.env.SOS_ADMIN_EMAIL ?? "stevegisanrin@aol.com";

function sanitiseNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const trimmed = String(note).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, SOS_NOTE_MAX);
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Insert an SOS alert as the current user. RLS enforces user_id = auth.uid().
 * On success, kicks off best-effort notification emails.
 */
export async function raiseSos(
  input: RaiseSosInput,
): Promise<RaiseSosResult> {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated", status: 401 };
  }

  const lat = isFiniteNumber(input.lat) ? input.lat : null;
  const lng = isFiniteNumber(input.lng) ? input.lng : null;
  const accuracy = isFiniteNumber(input.accuracyM) ? input.accuracyM : null;
  const note = sanitiseNote(input.note);
  const bookingId =
    typeof input.bookingId === "string" && input.bookingId
      ? input.bookingId
      : null;

  // If a booking_id is provided, verify the user is a party to it. We can't
  // rely solely on the FK because SET NULL on delete still allows pointing
  // at any booking. RLS on bookings already restricts visibility, so a
  // simple read confirms party-ness.
  if (bookingId) {
    const { data: booking } = await client
      .from("bookings")
      .select("id, seeker_id, caregiver_id")
      .eq("id", bookingId)
      .maybeSingle<{ id: string; seeker_id: string; caregiver_id: string | null }>();
    if (
      !booking ||
      (booking.seeker_id !== user.id && booking.caregiver_id !== user.id)
    ) {
      return {
        ok: false,
        error: "Booking not found or you're not a party to it",
        status: 403,
      };
    }
  }

  const { data: inserted, error } = await client
    .from("sos_alerts")
    .insert({
      user_id: user.id,
      booking_id: bookingId,
      lat,
      lng,
      accuracy_m: accuracy,
      note,
    })
    .select(
      "id, user_id, booking_id, lat, lng, accuracy_m, note, status, acknowledged_by, acknowledged_at, resolved_at, created_at",
    )
    .single<SosAlert>();

  if (error || !inserted) {
    return {
      ok: false,
      error: error?.message ?? "Couldn't raise SOS",
      status: 500,
    };
  }

  // Fire-and-forget notifications. We intentionally don't await this —
  // SMTP latency must not delay the SOS API response.
  void notifyAdminsAndCounterpart(inserted, user.email ?? null).catch((e) => {
    console.error("[sos] notify failed", e);
  });

  return { ok: true, alert: inserted };
}

async function notifyAdminsAndCounterpart(
  alert: SosAlert,
  raiserEmail: string | null,
) {
  const admin = createAdminClient();

  // Resolve raiser display name (best effort).
  let raiserName: string | null = null;
  try {
    const { data: prof } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", alert.user_id)
      .maybeSingle<{ full_name: string | null }>();
    raiserName = prof?.full_name ?? null;
  } catch {
    // ignore
  }

  // Resolve counterpart email if booking-linked.
  let counterpartEmail: string | null = null;
  let counterpartName: string | null = null;
  if (alert.booking_id) {
    try {
      const { data: booking } = await admin
        .from("bookings")
        .select("seeker_id, caregiver_id")
        .eq("id", alert.booking_id)
        .maybeSingle<{ seeker_id: string; caregiver_id: string | null }>();
      if (booking) {
        const otherId =
          booking.seeker_id === alert.user_id
            ? booking.caregiver_id
            : booking.seeker_id;
        if (otherId) {
          const { data: u } = await admin.auth.admin.getUserById(otherId);
          counterpartEmail = u?.user?.email ?? null;
          const { data: p } = await admin
            .from("profiles")
            .select("full_name")
            .eq("id", otherId)
            .maybeSingle<{ full_name: string | null }>();
          counterpartName = p?.full_name ?? null;
        }
      }
    } catch {
      // ignore
    }
  }

  const mapsUrl =
    alert.lat !== null && alert.lng !== null
      ? `https://www.google.com/maps?q=${alert.lat},${alert.lng}`
      : null;

  const subject = `🚨 SOS raised by ${raiserName ?? raiserEmail ?? "a SpecialCarer user"}`;

  const detailLines: string[] = [
    `User: ${raiserName ?? "(unknown)"} <${raiserEmail ?? "no email"}>`,
    `Booking: ${alert.booking_id ?? "—"}`,
    `Location: ${
      mapsUrl
        ? `${alert.lat}, ${alert.lng} (±${alert.accuracy_m ?? "?"}m)`
        : "—"
    }`,
    alert.note ? `Note: ${alert.note}` : "Note: —",
    `Raised at: ${new Date(alert.created_at).toISOString()}`,
    `Alert ID: ${alert.id}`,
  ];

  const html = `
    <div style="font-family:Plus Jakarta Sans,Arial,sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#A33;margin:0 0 8px">🚨 SOS raised on SpecialCarer</h2>
      <p style="color:#2F2E31;margin:0 0 16px">A user has triggered the in-app SOS button. Please acknowledge promptly.</p>
      <ul style="color:#2F2E31;line-height:1.6">
        ${detailLines.map((l) => `<li>${l}</li>`).join("")}
      </ul>
      ${
        mapsUrl
          ? `<p style="margin-top:16px"><a href="${mapsUrl}" style="background:#039EA0;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open in Google Maps</a></p>`
          : ""
      }
      <p style="color:#575757;font-size:12px;margin-top:24px">— SpecialCarer Trust &amp; Safety</p>
    </div>
  `;

  const text = [
    "🚨 SOS raised on SpecialCarer",
    "",
    ...detailLines,
    mapsUrl ? `Map: ${mapsUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Admin notification — primary.
  await sendEmail({ to: ADMIN_EMAIL, subject, html, text }).catch((e) =>
    console.error("[sos] admin email failed", e),
  );

  // Counterpart notification — only if booking-linked and we have an email.
  if (counterpartEmail) {
    const cpSubject = `🚨 SOS on your SpecialCarer booking`;
    const cpText = [
      `${raiserName ?? "Your booking party"} has raised an SOS on the booking you share.`,
      "",
      `Booking: ${alert.booking_id}`,
      alert.note ? `Note: ${alert.note}` : "",
      mapsUrl ? `Map: ${mapsUrl}` : "",
      "",
      "Please check on them and contact emergency services if needed.",
    ]
      .filter(Boolean)
      .join("\n");
    const cpHtml = `
      <div style="font-family:Plus Jakarta Sans,Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#A33;margin:0 0 8px">🚨 SOS on your SpecialCarer booking</h2>
        <p style="color:#2F2E31">${raiserName ?? "Your booking party"} has raised an SOS on the booking you share. Please check on them and contact emergency services if needed.</p>
        <ul style="color:#2F2E31;line-height:1.6">
          <li>Booking: ${alert.booking_id}</li>
          ${alert.note ? `<li>Note: ${alert.note}</li>` : ""}
        </ul>
        ${
          mapsUrl
            ? `<p><a href="${mapsUrl}" style="background:#039EA0;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open in Google Maps</a></p>`
            : ""
        }
        <p style="color:#575757;font-size:12px;margin-top:24px">If this is a life-threatening emergency, call <strong>999</strong> (UK) or <strong>911</strong> (US) immediately.</p>
      </div>
    `;
    void sendEmail({
      to: counterpartEmail,
      subject: cpSubject,
      html: cpHtml,
      text: cpText,
    }).catch((e) => console.error("[sos] counterpart email failed", e));
    // Counterpart name is captured for future notification surfaces; ESLint
    // would otherwise complain if we left it unused.
    void counterpartName;
  }
}
