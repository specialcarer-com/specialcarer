/**
 * Marketing-page hero banner slots.
 *
 * Each entry is a stable page_key used both as a Supabase row key and in the
 * admin UI. The label is what admins see in the picker. The default_gradient
 * is the on-brand fallback shown when no media has been uploaded so the site
 * never looks broken.
 */

export type PageBannerSlot = {
  /** Stable key — used as primary key in page_hero_banners. */
  key: string;
  /** Human label for the admin UI. */
  label: string;
  /** Group label for organising the admin list. */
  group: string;
  /** Public path of the page where this banner appears, for preview links. */
  path: string;
  /**
   * Tailwind/inline gradient used as the fallback when no media has been
   * uploaded. Each slot gets a different on-brand variant so unmanaged pages
   * still have visual identity.
   */
  fallbackGradient: string;
  /** Default suggested alt text — admins can override. */
  defaultAlt: string;
};

const teal =
  "linear-gradient(135deg, #0E7C7B 0%, #039EA0 50%, #02787A 100%)";
const tealCream =
  "linear-gradient(135deg, #0E7C7B 0%, #3FC6C8 55%, #F4EFE6 100%)";
const tealAmber =
  "linear-gradient(135deg, #0E7C7B 0%, #2EA9AB 50%, #F4A261 100%)";
const inkTeal =
  "linear-gradient(135deg, #0F1416 0%, #0B6463 60%, #039EA0 100%)";
const creamTeal =
  "linear-gradient(135deg, #F4EFE6 0%, #C2E5E4 55%, #0E7C7B 100%)";

export const PAGE_BANNER_SLOTS: PageBannerSlot[] = [
  // ── Services ──
  {
    key: "services.elderly_care",
    label: "Elderly care",
    group: "Services",
    path: "/services/elderly-care",
    fallbackGradient: tealCream,
    defaultAlt: "Caregiver helping an elderly client at home",
  },
  {
    key: "services.childcare",
    label: "Childcare",
    group: "Services",
    path: "/services/childcare",
    fallbackGradient: tealAmber,
    defaultAlt: "Childcare professional with a child",
  },
  {
    key: "services.special_needs",
    label: "Special needs",
    group: "Services",
    path: "/services/special-needs",
    fallbackGradient: tealCream,
    defaultAlt: "Special-needs support carer with client",
  },
  {
    key: "services.postnatal",
    label: "Postnatal",
    group: "Services",
    path: "/services/postnatal",
    fallbackGradient: creamTeal,
    defaultAlt: "Postnatal carer with new parent and baby",
  },
  {
    key: "services.complex_care",
    label: "Complex care",
    group: "Services",
    path: "/services/complex-care",
    fallbackGradient: inkTeal,
    defaultAlt: "Clinical complex-care nurse with client",
  },
  // ── Care formats ──
  {
    key: "care_formats.live_in",
    label: "Live-in care",
    group: "Care formats",
    path: "/care-formats/live-in",
    fallbackGradient: tealCream,
    defaultAlt: "Live-in carer at home with client",
  },
  {
    key: "care_formats.visiting",
    label: "Visiting care",
    group: "Care formats",
    path: "/care-formats/visiting",
    fallbackGradient: teal,
    defaultAlt: "Visiting carer arriving at client home",
  },
  // ── Marketing core ──
  {
    key: "marketing.how_it_works",
    label: "How it works",
    group: "Marketing",
    path: "/how-it-works",
    fallbackGradient: teal,
    defaultAlt: "How SpecialCarer matches families with carers",
  },
  {
    key: "marketing.trust",
    label: "Safety & trust",
    group: "Marketing",
    path: "/trust",
    fallbackGradient: inkTeal,
    defaultAlt: "Background-checked and verified caregivers",
  },
  {
    key: "marketing.pricing",
    label: "Pricing",
    group: "Marketing",
    path: "/pricing",
    fallbackGradient: creamTeal,
    defaultAlt: "Transparent pricing for care services",
  },
  {
    key: "marketing.blog",
    label: "Blog",
    group: "Marketing",
    path: "/blog",
    fallbackGradient: tealCream,
    defaultAlt: "Stories and guides from SpecialCarer",
  },
  {
    key: "marketing.cities",
    label: "Cities",
    group: "Marketing",
    path: "/care-in",
    fallbackGradient: teal,
    defaultAlt: "Care available across the UK and US",
  },
  // ── Audiences ──
  {
    key: "audience.employers",
    label: "For employers",
    group: "Audiences",
    path: "/employers",
    fallbackGradient: inkTeal,
    defaultAlt: "Employer-supported care benefits",
  },
  {
    key: "audience.organisations",
    label: "For organisations",
    group: "Audiences",
    path: "/organisations",
    fallbackGradient: tealAmber,
    defaultAlt: "Care providers partnering with SpecialCarer",
  },
  {
    key: "audience.caregivers",
    label: "For caregivers",
    group: "Audiences",
    path: "/become-a-caregiver",
    fallbackGradient: tealCream,
    defaultAlt: "Become a SpecialCarer caregiver",
  },
  // ── Account ──
  {
    key: "account.login",
    label: "Sign in",
    group: "Account",
    path: "/login",
    fallbackGradient: tealCream,
    defaultAlt:
      "A woman at her kitchen counter checking her phone, laptop open, signing in to SpecialCarer",
  },
];

export function getSlot(key: string): PageBannerSlot | undefined {
  return PAGE_BANNER_SLOTS.find((s) => s.key === key);
}

/**
 * Group slots by their "group" field, preserving registry order within each
 * group, for the admin UI.
 */
export function groupedSlots(): Record<string, PageBannerSlot[]> {
  const out: Record<string, PageBannerSlot[]> = {};
  for (const s of PAGE_BANNER_SLOTS) {
    if (!out[s.group]) out[s.group] = [];
    out[s.group].push(s);
  }
  return out;
}
