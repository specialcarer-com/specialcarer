/**
 * Server-side data layer for Household Recipients.
 *
 * Reads use the user-scoped SSR client so RLS naturally enforces
 * "owner or active family member" visibility.
 * Writes use the admin client and we enforce ownership in code.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  HouseholdRecipient,
  RecipientCreateInput,
  RecipientKind,
  RecipientUpdateInput,
} from "./types";

const RECIPIENT_COLUMNS =
  "id, owner_id, family_id, kind, display_name, notes, photo_url, " +
  "date_of_birth, allergies, school, special_needs, " +
  "mobility_level, medical_conditions, medications, " +
  "address_line1, address_line2, city, region, postcode, country, " +
  "property_size, has_pets, pets_notes, access_instructions, " +
  "created_at, updated_at";

function sanitizeInput(
  input: RecipientCreateInput | RecipientUpdateInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const copy = (k: keyof RecipientCreateInput) => {
    if (input[k] !== undefined) out[k] = input[k];
  };
  copy("display_name");
  copy("notes");
  copy("photo_url");
  copy("family_id");
  copy("date_of_birth");
  copy("allergies");
  copy("school");
  copy("special_needs");
  copy("mobility_level");
  copy("medical_conditions");
  copy("medications");
  copy("address_line1");
  copy("address_line2");
  copy("city");
  copy("region");
  copy("postcode");
  copy("country");
  copy("property_size");
  copy("has_pets");
  copy("pets_notes");
  copy("access_instructions");
  return out;
}

export function validateInput(
  input: RecipientCreateInput | RecipientUpdateInput,
  isCreate: boolean,
): string | null {
  if (isCreate) {
    const c = input as RecipientCreateInput;
    if (!c.kind) return "Recipient kind is required";
    if (!c.display_name || !c.display_name.trim())
      return "Display name is required";
    if (c.display_name.length > 80) return "Display name too long";
  }
  if (input.notes && input.notes.length > 2000) return "Notes too long";
  if (input.allergies && input.allergies.length > 30) return "Too many allergies";
  if (input.special_needs && input.special_needs.length > 30)
    return "Too many special-needs tags";
  if (input.medical_conditions && input.medical_conditions.length > 30)
    return "Too many medical conditions";
  if (input.medications && input.medications.length > 50)
    return "Too many medications";
  if (input.access_instructions && input.access_instructions.length > 1000)
    return "Access instructions too long";
  return null;
}

export async function listMyRecipients(): Promise<HouseholdRecipient[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("household_recipients")
    .select(RECIPIENT_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[recipients] list failed", error);
    return [];
  }
  return (data ?? []) as unknown as HouseholdRecipient[];
}

export async function getRecipient(
  id: string,
): Promise<HouseholdRecipient | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("household_recipients")
    .select(RECIPIENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[recipients] get failed", error);
    return null;
  }
  return (data ?? null) as unknown as HouseholdRecipient | null;
}

export async function createRecipient(
  ownerId: string,
  kind: RecipientKind,
  input: RecipientCreateInput,
): Promise<{ ok: true; recipient: HouseholdRecipient } | { ok: false; error: string }> {
  const validationErr = validateInput(input, true);
  if (validationErr) return { ok: false, error: validationErr };

  const admin = createAdminClient();
  const row = {
    owner_id: ownerId,
    kind,
    ...sanitizeInput(input),
  };

  const { data, error } = await admin
    .from("household_recipients")
    .insert(row)
    .select(RECIPIENT_COLUMNS)
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create recipient" };
  }
  return { ok: true, recipient: data as unknown as HouseholdRecipient };
}

export async function updateRecipient(
  ownerId: string,
  id: string,
  input: RecipientUpdateInput,
): Promise<{ ok: true; recipient: HouseholdRecipient } | { ok: false; error: string }> {
  const validationErr = validateInput(input, false);
  if (validationErr) return { ok: false, error: validationErr };

  const admin = createAdminClient();

  const { data: existing, error: existingErr } = await admin
    .from("household_recipients")
    .select("owner_id")
    .eq("id", id)
    .maybeSingle();
  if (existingErr) return { ok: false, error: existingErr.message };
  if (!existing) return { ok: false, error: "Not found" };
  if (existing.owner_id !== ownerId)
    return { ok: false, error: "Not authorised" };

  const { data, error } = await admin
    .from("household_recipients")
    .update(sanitizeInput(input))
    .eq("id", id)
    .select(RECIPIENT_COLUMNS)
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not update recipient" };
  }
  return { ok: true, recipient: data as unknown as HouseholdRecipient };
}

export async function deleteRecipient(
  ownerId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("household_recipients")
    .select("owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Not found" };
  if (existing.owner_id !== ownerId)
    return { ok: false, error: "Not authorised" };

  const { error } = await admin
    .from("household_recipients")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
