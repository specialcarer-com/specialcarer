/**
 * SOS alert public types — shared by API + UI.
 */

export type SosStatus = "open" | "acknowledged" | "resolved";

export type SosAlert = {
  id: string;
  user_id: string;
  booking_id: string | null;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  note: string | null;
  status: SosStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

export const SOS_NOTE_MAX = 1000;
