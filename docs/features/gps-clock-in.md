# GPS clock-in / clock-out (Sprint 4.5 scaffold)

Self-attesting visit verification: the carer records a GPS-stamped clock-in on
arrival and clock-out on leaving. This gives us the evidence-of-visit trail CQC
expects and is the event source a later payroll cycle will read from.

Ported from the CareLinx (US) competitor audit — see
`gap_audit_carelinx_us.md`. This is a **scaffold**: data model, API, minimal
carer UI, and a read-only ops surface. It deliberately does not enforce a
geofence radius, upload photos, or generate timesheets.

## Data model

Table `public.visit_events` (append-only):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `visit_id` | uuid fk → `bookings(id)` | the visit; cascade delete |
| `carer_id` | uuid fk → `auth.users(id)` | must equal `bookings.caregiver_id` |
| `event_type` | enum `visit_event_type` | `clock_in` \| `clock_out` |
| `event_at` | timestamptz | authoritative event time (server-set) |
| `latitude` / `longitude` | numeric(9,6) | device-reported fix |
| `accuracy_metres` | numeric | GPS-reported accuracy |
| `client_reported_at` | timestamptz | device clock at the event |
| `server_recorded_at` | timestamptz | `now()` when persisted |
| `device_info` | jsonb | user-agent / platform / app version |
| `notes` | text | optional carer note (≤ 1000 chars) |
| `photo_url` | text | placeholder for future photo verification |

Indexes: `(visit_id)`, `(carer_id, event_at desc)`.

**RLS**
- Carer may `insert` their own events for their own visit.
- Booking parties (assigned carer + seeker/family) may `select`.
- Admins may `select` all.

**Helper**: `visit_duration_from_events(p_visit_id uuid) returns interval` —
earliest `clock_in` to latest `clock_out`, or null if either bookend is missing.

## API contract

### `POST /api/bookings/[id]/clock`
Auth: must be the booking's assigned carer.

Body:
```jsonc
{
  "event_type": "clock_in" | "clock_out",
  "latitude": 51.5074,
  "longitude": -0.1278,
  "accuracy_metres": 12,
  "client_reported_at": "2026-07-12T09:00:00.000Z",
  "notes": "At the front door"   // optional, ≤ 1000 chars
}
```

Responses:
- `201` — `{ event }` (the created row)
- `400` — invalid body
- `401` — unauthenticated
- `403` — not the assigned carer
- `404` — visit not found
- `409` — non-clockable visit status, or a duplicate event of the same type
  within 30 seconds

Geofence radius is **not** enforced — the device reading is recorded as-is.

### `GET /api/bookings/[id]/events`
Auth: booking party (carer or seeker/family) or admin. Returns
`{ events }` ordered by `event_at` ascending.

## Carer UI

`src/app/m/active-job/[id]/_components/GpsClockCard.tsx`, mounted on the carer
active-job screen. Self-contained — reads `/events` for its own state, so the
existing selfie + geofence check-in flow is untouched.

- **Clock in** — shown until a `clock_in` exists. Requests a high-accuracy fix
  (10 s timeout) then POSTs.
- **Clock out** — shown once clocked in, until a `clock_out` exists.
- After both, shows "Clocked in at HH:mm · Clocked out at HH:mm".

State handling:
- Permission denied / unavailable → "GPS permission required to clock in.
  Enable location for SpecialCarers in device settings." The action is blocked —
  a location fix is required (that is the point of the feature).
- Timeout → retry.
- Network / server error → retry with "Try again — your clock-in has not been
  recorded."

Primary button uses brand teal (`bg-primary` = `#039EA0`).

## Ops surface (read-only)

`src/app/admin/bookings/[id]` gains a **Visit events** card:
- Table: time, type, lat/long (links to Google Maps), accuracy in metres, notes.
- Computed duration when both bookends exist.
- Delta between scheduled start and actual clock-in (e.g. "12 min late").

No mutation from ops in this PR.

## Deferred to follow-ups

- Geofence radius policy enforcement.
- Photo verification (the `photo_url` column is a placeholder only).
- Payroll timesheet auto-generation from clock events.
- Family-portal visibility of clock events.
