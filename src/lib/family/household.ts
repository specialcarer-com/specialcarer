/**
 * Household-membership helpers for Designated Payer (gap 31).
 *
 * A "household" here is the seeker's family (see 20260506_family_sharing.sql):
 * the family they own as `primary_user_id`, plus every active `family_members`
 * row. The seeker themselves is always a member of their own household (the
 * trigger seeds a role='primary' member row, but we also treat the seeker as a
 * valid payer explicitly so the check holds even before any family exists).
 *
 * These functions are pure over a thin DB adapter so they can be unit-tested
 * without pulling in @supabase/supabase-js or next/headers.
 */

export type HouseholdMember = {
  user_id: string;
  display_name: string | null;
};

/**
 * Thin DB shape the household helpers need. Implemented by the route adapter
 * with the admin (service-role) client; stubbed in tests.
 */
export type HouseholdClient = {
  /** The family the seeker owns, if any. */
  getOwnFamilyId(
    seekerId: string,
  ): Promise<{ familyId: string | null; error: { message: string } | null }>;
  /** Active member rows for a family (user_id non-null). */
  listActiveMembers(
    familyId: string,
  ): Promise<{
    members: HouseholdMember[];
    error: { message: string } | null;
  }>;
  /** Display name fallback for a user (from profiles.full_name). */
  getUserName(userId: string): Promise<string | null>;
};

/**
 * Returns the de-duplicated list of household adults who may be set as payer:
 * the seeker plus every active member of the seeker's family. The seeker is
 * always included first. Returns an error envelope so callers can map to 500.
 */
export async function listHouseholdAdults(
  seekerId: string,
  client: HouseholdClient,
): Promise<{ members: HouseholdMember[]; error: { message: string } | null }> {
  const own = await client.getOwnFamilyId(seekerId);
  if (own.error) return { members: [], error: own.error };

  const seekerName = await client.getUserName(seekerId);
  const byId = new Map<string, HouseholdMember>();
  byId.set(seekerId, { user_id: seekerId, display_name: seekerName });

  if (own.familyId) {
    const active = await client.listActiveMembers(own.familyId);
    if (active.error) return { members: [], error: active.error };
    for (const m of active.members) {
      if (!m.user_id) continue;
      if (!byId.has(m.user_id)) {
        byId.set(m.user_id, {
          user_id: m.user_id,
          display_name: m.display_name,
        });
      }
    }
  }

  return { members: Array.from(byId.values()), error: null };
}

/**
 * True when `candidateUserId` is a valid payer for `seekerId`'s household:
 * either the seeker themselves, or an active member of the seeker's family.
 */
export async function isInSameHousehold(
  seekerId: string,
  candidateUserId: string,
  client: HouseholdClient,
): Promise<{ ok: boolean; error: { message: string } | null }> {
  if (candidateUserId === seekerId) return { ok: true, error: null };
  const { members, error } = await listHouseholdAdults(seekerId, client);
  if (error) return { ok: false, error };
  return { ok: members.some((m) => m.user_id === candidateUserId), error: null };
}
