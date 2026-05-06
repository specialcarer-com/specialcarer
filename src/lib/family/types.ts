/**
 * Family Sharing v1 types — shared between server and client.
 * Keep this file free of `next/headers` and SDK imports.
 */

export type FamilyMemberRole = "primary" | "member";
export type FamilyMemberStatus = "active" | "invited" | "removed";
export type FamilyInviteStatus =
  | "pending"
  | "accepted"
  | "revoked"
  | "expired";

export type FamilyMember = {
  id: string;
  family_id: string;
  user_id: string | null;
  invited_email: string | null;
  display_name: string | null;
  role: FamilyMemberRole;
  status: FamilyMemberStatus;
  joined_at: string | null;
  created_at: string;
  /** Hydrated from auth.users when available. */
  email?: string | null;
};

export type FamilyInvite = {
  id: string;
  family_id: string;
  invited_email: string;
  display_name: string | null;
  status: FamilyInviteStatus;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
};

export type Family = {
  id: string;
  primary_user_id: string;
  display_name: string | null;
  created_at: string;
};

export type FamilyOverview = {
  family: Family;
  members: FamilyMember[];
  invites: FamilyInvite[];
  /** Whether the current user is the primary (booker / payer). */
  is_primary: boolean;
};

/** Default invite expiry — matched in server lib. */
export const FAMILY_INVITE_TTL_DAYS = 7;
export const FAMILY_MAX_MEMBERS = 8;
