# GPS clock-in / clock-out (Sprint 4.5 v2)

Self-attesting visit verification: the carer records a GPS-stamped clock-in on
arrival and clock-out on leaving. This gives us the evidence-of-visit trail CQC
expects and is the event source a later payroll cycle will read from.

Ported from the CareLinx (US) competitor audit — see
`gap_audit_carelinx_us.md`. Sprint 4.5 shipped the scaffold (data model, API,
minimal carer UI, read-only ops surface). **v2** adds:

- a **HARD 50 m geofence** on clock-in (with an auditable ops override),
- a **clock-in selfie** captured, stored privately, and reviewable by ops,
- an ops **manual photo-review** action ("Mark verified" / "Mark failed").

The **automated photo-match engine is DEFERRED** — see
[Match engine: DEFERRED](#match-engine-deferred). Photos are captured and stored
now; the similarity-score UI is wired but inert until an engine ships.

## Enforcement matrix

| Check | Enforcement | On failure |
|---|---|---|
| GPS fix present | **Blocking** (client-side) | Cannot clock in/out until a fix resolves |
| Geofence ≤ 50 m (clock-in) | **Blocking** (server, `409`) | No event inserted; ops override path available |
| Geofence (clock-out) | Not enforced | `geofence_status` stays null |
| GPS accuracy | **Advisory** | Poor accuracy (> 100 m) is a caveat, never an auto-fail |
| No client address geocoded | Non-blocking | Inserts with `geofence_status = no_client_address` for ops |
| Clock-in photo capture | **Blocking** at capture | Camera-denied blocks; unavailable → skip (ops-flagged) |
| Photo **match** | Advisory / **deferred** | Stays `pending`; ops may mark passed/failed by hand |

## Data model

Table `public.visit_events` (append-only). Sprint-4.5 columns plus the v2
verification columns:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | client may precompute so the selfie uploads before the row |
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
| `photo_url` | text | storage path in the private `visit-photos` bucket |
| `photo_verification_status` | enum `visit_photo_verification_status` | `pending` \| `passed` \| `failed` \| `skipped` \| `error` |
| `photo_similarity_score` | numeric(5,4) | 0–1 match score (null until an engine ships) |
| `photo_verification_checked_at` | timestamptz | when a decision (manual/auto) was recorded |
| `geofence_status` | enum `visit_geofence_status` | `passed` \| `failed` \| `no_client_address` \| `no_carer_location` \| `override` |
| `distance_from_client_metres` | numeric | measured carer→client distance (audit) |
| `admin_override_by` | uuid fk → `profiles(id)` | admin who recorded a geofence override |
| `admin_override_reason` | text | mandatory, ≥ 20 chars (DB CHECK) |
| `admin_override_at` | timestamptz | when the override was recorded |
| `verified_by_admin_id` | uuid fk → `profiles(id)` | admin who set a manual photo decision |

Enum types added in v2:
- `visit_photo_verification_status` — `pending`, `passed`, `failed`, `skipped`, `error`.
- `visit_geofence_status` — `passed`, `failed`, `no_client_address`, `no_carer_location`, `override`.

**RLS on `visit_events`**
- Carer may `insert` their own events for their own visit.
- Booking parties (assigned carer + seeker/family) may `select`.
- Admins may `select` all.
- **No authenticated `UPDATE` policy exists.** This is deliberate: the
  verification columns (`photo_verification_*`, `verified_by_admin_id`,
  `geofence_status`, `admin_override_*`) are writable **only** via the
  service-role client from the admin routes below. Postgres RLS is row-level,
  not column-level, so the absence of an UPDATE policy is what reserves those
  fields — carers cannot self-attest a `passed` match or a geofence override.

**Private storage bucket `visit-photos`** (not public). Object key layout is
`{carer_id}/{visit_id}/{event_id}.jpg`. Policies on `storage.objects`:
- Carer may `insert`/`select` objects under their own `{carer_id}/…` prefix
  (`(storage.foldername(name))[1] = auth.uid()`).
- Admins may `select` all (`is_admin(auth.uid())`).
- Family/seeker may `select` objects for their own bookings, matched on the
  `{visit_id}` path segment joined to `bookings.seeker_id = auth.uid()`.
- No public read; ops thumbnails are served via short-lived **signed URLs**
  (1 h TTL) minted with the service-role client.

## API contract

### `POST /api/bookings/[id]/clock`
Auth: must be the booking's assigned carer.

Body:
```json
{
  "event_type": "clock_in",
  "latitude": 51.5074,
  "longitude": -0.1278,
  "accuracy_metres": 12,
  "client_reported_at": "2026-07-12T09:00:00.000Z",
  "notes": "At the front door",
  "event_id": "11111111-2222-3333-4444-555555555555",
  "photo_url": "carer-1/visit-1/11111111-2222-3333-4444-555555555555.jpg",
  "photo_verification_status": "pending"
}
```

- `notes` optional (≤ 1000 chars).
- `event_id` optional UUID — when the device precomputed the id to upload the
  selfie first, it is reused as the row id.
- `photo_url` optional storage path (≤ 512 chars).
- `photo_verification_status` optional; a carer's device may only set
  `pending`, `skipped`, or `error`. `passed`/`failed` are decided by the match
  engine or ops review and are rejected here (`400`).

**Geofence (clock-in only):** the server resolves the client's geocoded address
via the existing `booking_service_point_lnglat` RPC and evaluates the haversine
distance:
- **≤ 50 m → `passed`**, event inserted.
- **> 50 m → `409 geofence_failed`**, **no event inserted**.
- No client coords → `no_client_address`, event inserted (data-quality flag).
- Invalid carer coords → `no_carer_location`, event inserted.
- Accuracy > 100 m is an advisory caveat — it never changes the pass/fail.

`clock_out` is **not** fenced (a carer may legitimately move before leaving), so
`geofence_status` stays null on clock-out.

Responses:
- `201` — `{ event }` (the created row)
- `400` — invalid body
- `401` — unauthenticated
- `403` — not the assigned carer
- `404` — visit not found
- `409` — `{ error }`, one of:
  - `geofence_failed` — with `{ distance_metres, threshold_metres, address_hint }`
    (`address_hint` is the outward postcode only, e.g. `"SW1A"`)
  - `already_clocked_in` — the latest event is already a `clock_in`
  - `no_open_clock_in` — a `clock_out` with no open `clock_in` to close
  - `duplicate_event` — a repeat submit within 30 seconds of the last event
  - a non-clockable visit status message (e.g. a cancelled visit)
- `500` — `{ "error": "clock_failed" }`

### `GET /api/bookings/[id]/events`
Auth: booking party (carer or seeker/family) or admin. Returns `{ events }`
ordered by `event_at` ascending.

Responses: `200` `{ events }`, `401` unauthenticated, `403` forbidden,
`404` visit not found, `500` `{ "error": "load_failed" }`.

### `POST /api/admin/bookings/[id]/geofence-override`
Auth: admin (via `requireAdminApi` — includes MFA gate). **Not** exposed on the
carer app. Records an auditable clock-in that bypasses the 50 m block when an
admin confirms the carer is genuinely on-site (bad geocode, GPS drift, tower
block). Sets `geofence_status = 'override'` and the `admin_override_*` fields;
distance is still measured for the audit trail.

Body: the clock body geo fields (`event_type` must be `clock_in`) plus a
mandatory `reason` (≥ 20 chars, mirrors the DB CHECK constraint).

Responses:
- `201` — `{ event }`
- `400` — invalid body / reason too short / not `clock_in` / no assigned carer
- `401` — unauthenticated
- `403` — `{ "error": "Forbidden" }` (not an admin)
- `404` — `{ "error": "visit not found" }`
- `428` — admin MFA setup/challenge required
- `500` — `{ "error": "override_failed" }`

### `POST /api/admin/visit-events/[eventId]/photo-review`
Auth: admin (via `requireAdminApi`). Manual ops decision on a clock-in selfie
until the match engine ships. Writes `photo_verification_status` (+
`photo_verification_checked_at`, `verified_by_admin_id`) via the service-role
client.

Body: `{ "status": "passed" | "failed" }`.

Responses:
- `200` — `{ event }`
- `400` — `{ "error": "status must be passed or failed" }`
- `401` — unauthenticated
- `403` — `{ "error": "Forbidden" }`
- `404` — `{ "error": "event not found" }`
- `428` — admin MFA required
- `500` — `{ "error": "review_failed" }`

## Carer UI

`src/app/m/active-job/[id]/_components/GpsClockCard.tsx` (+ `PhotoCapture.tsx`),
mounted on the carer active-job screen. Self-contained — reads `/events` for its
own state.

Clock-in flow:

```
[Clock in] tap
   │
   ▼
Request GPS fix (high accuracy, 10s)
   │  denied/unavailable → block: "GPS permission required…"
   │  timeout            → "Couldn't get a GPS fix in time. Try again."
   ▼
Open camera (front / facingMode:user)
   │  permission denied  → block: "Camera access required…"  (no clock-in)
   │  hardware unavailable → "Skip photo (ops review required)" → status=skipped
   │  cancel             → abort, no event
   ▼
Capture selfie → downscale to ≤ 1024×1024 JPEG
   │
   ▼
Upload to visit-photos/{carer}/{visit}/{event_id}.jpg  (retry once)
   │  upload fails after retry → POST clock with status=error (ops-flagged)
   ▼
POST /clock { event_id, photo_url, photo_verification_status: "pending", …coords }
   │  409 geofence_failed → "You appear to be {N}m from the client's address
   │                         (must be within 50m). Move closer, or contact ops."
   ▼
Success: "Clocked in — the family can see your visit has started."
```

Clock-out is GPS-only (no photo, no geofence).

Photo states surfaced to the carer:
- **Skipped** (camera unavailable or explicit skip) — clocks in but the shift is
  flagged for ops review.
- **Error** (upload failed after one retry) — clocks in, flagged for ops review.

Primary button uses brand teal (`bg-primary` = `#039EA0`).

## Ops surface

`src/app/admin/bookings/[id]` **Visit events** card
(`VisitEventsCard.tsx` → `VisitPhotoCell.tsx`):
- Columns: time, type, **photo**, **geofence**, lat/long (Google Maps link),
  accuracy, notes.
- **Photo cell**: selfie thumbnail (click → full-size modal), an advisory
  status badge, similarity % (shown only once a decision exists), and the
  attribution "by {admin}" when a manual decision was recorded.
- **Manual review**: "Mark verified" / "Mark failed" buttons POST to the
  photo-review endpoint and refresh. This is the interim workflow while the
  match engine is deferred.
- **Geofence badge** with the measured distance; an override shows
  "Overridden by {admin} — {reason}" prominently.
- Computed visit duration and clock-in delta ("12 min late") as before.

Badge colours use brand tokens only — teal (`#E6F5F5`/`#016E70`) for
passed/in-geofence, peach (`#FBEEDF`/`#B9651A`) for failed/override, muted cream
(`#F4EFE6`/`#0F1416`) for skipped/error/no-address, neutral slate for pending.

## Match engine: DEFERRED

The automated clock-in photo match (does the selfie match the carer's reference
photo?) is **not** in this PR. The decision between two implementations is open
and has a cost/vendor dimension:

1. **Extend Veriff** — we already integrate Veriff for identity/liveness
   (`src/lib/identity/…`). A per-visit face-match call reuses that trust
   boundary but adds per-check vendor cost at clock-in volume.
2. **In-house embedding** — a face-embedding model (e.g. ONNX) run in an edge
   function scoring cosine similarity against a stored reference embedding. No
   per-call vendor fee, but model hosting, accuracy tuning, and bias/False-Match
   testing are on us.

Until that decision is made:
- Selfies are **captured, stored privately, and reviewable** by ops.
- `photo_verification_status` stays `pending` unless an admin marks it by hand.
- `photo_similarity_score` and the similarity-% UI are **wired but inert**
  (always null / hidden). `src/lib/visit-verification/config.ts` carries a
  provisional `PHOTO_MATCH_THRESHOLD = 0.65` — a common cosine-similarity
  operating point that trades false-accepts against false-rejects — to be
  re-tuned against a labelled set once an engine is chosen. It is not read by
  any gate today.

**Not shipped here:** the `verify-visit-photo` edge function, any ONNX/embedding
code or model weights, automated scoring, and Veriff face-match extensions.

## Deferred to follow-ups

- Automated photo-match engine (see above) + threshold tuning on labelled data.
- Payroll timesheet auto-generation from clock events.
- Family-portal visibility of clock events and verification status.
