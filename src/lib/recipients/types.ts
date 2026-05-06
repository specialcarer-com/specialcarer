export type RecipientKind = "child" | "senior" | "home";

export type MobilityLevel = "independent" | "assisted" | "wheelchair" | "bedbound";

export type PropertySize =
  | "studio"
  | "1bed"
  | "2bed"
  | "3bed"
  | "4bed_plus"
  | "house_small"
  | "house_med"
  | "house_large";

export type Country = "GB" | "US";

export interface Medication {
  name: string;
  dose?: string;
  schedule?: string; // free text e.g. "8am, 2pm"
}

export interface HouseholdRecipient {
  id: string;
  owner_id: string;
  family_id: string | null;
  kind: RecipientKind;

  display_name: string;
  notes: string | null;
  photo_url: string | null;

  // child
  date_of_birth: string | null; // ISO date
  allergies: string[] | null;
  school: string | null;
  special_needs: string[] | null;

  // senior
  mobility_level: MobilityLevel | null;
  medical_conditions: string[] | null;
  medications: Medication[] | null;

  // home
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: Country | null;
  property_size: PropertySize | null;
  has_pets: boolean | null;
  pets_notes: string | null;
  access_instructions: string | null;

  created_at: string;
  updated_at: string;
}

export interface RecipientCreateInput {
  kind: RecipientKind;
  display_name: string;
  notes?: string | null;
  photo_url?: string | null;
  family_id?: string | null;

  // child
  date_of_birth?: string | null;
  allergies?: string[] | null;
  school?: string | null;
  special_needs?: string[] | null;

  // senior
  mobility_level?: MobilityLevel | null;
  medical_conditions?: string[] | null;
  medications?: Medication[] | null;

  // home
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  region?: string | null;
  postcode?: string | null;
  country?: Country | null;
  property_size?: PropertySize | null;
  has_pets?: boolean | null;
  pets_notes?: string | null;
  access_instructions?: string | null;
}

export type RecipientUpdateInput = Partial<RecipientCreateInput>;

export const MOBILITY_LEVELS: { key: MobilityLevel; label: string }[] = [
  { key: "independent", label: "Independent" },
  { key: "assisted", label: "Needs assistance" },
  { key: "wheelchair", label: "Wheelchair" },
  { key: "bedbound", label: "Bedbound" },
];

export const PROPERTY_SIZES: { key: PropertySize; label: string }[] = [
  { key: "studio", label: "Studio" },
  { key: "1bed", label: "1-bed flat" },
  { key: "2bed", label: "2-bed flat" },
  { key: "3bed", label: "3-bed flat" },
  { key: "4bed_plus", label: "4+ bed flat" },
  { key: "house_small", label: "Small house" },
  { key: "house_med", label: "Medium house" },
  { key: "house_large", label: "Large house" },
];
