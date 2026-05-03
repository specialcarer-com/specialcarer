export type CityEntry = {
  slug: string;
  countrySlug: "uk" | "us";
  country: "GB" | "US";
  city: string; // canonical city name (matches caregiver_profiles.city case-insensitively)
  region: string; // displayed region/state
  blurb: string;
  neighbourhoods: string[]; // marketing copy only
};

export const CITIES: CityEntry[] = [
  {
    slug: "london",
    countrySlug: "uk",
    country: "GB",
    city: "London",
    region: "England",
    blurb:
      "From Hampstead to Hackney, our London caregivers can be at your door — often within hours. DBS-checked, paediatric-first-aid trained, and ready for one-off bookings or recurring schedules.",
    neighbourhoods: [
      "Camden",
      "Islington",
      "Hackney",
      "Tower Hamlets",
      "Lambeth",
      "Wandsworth",
      "Kensington & Chelsea",
      "Richmond",
    ],
  },
  {
    slug: "manchester",
    countrySlug: "uk",
    country: "GB",
    city: "Manchester",
    region: "England",
    blurb:
      "Greater Manchester caregivers covering city centre, Salford, Trafford, Stockport, and beyond. Whether you&rsquo;re in Didsbury, Chorlton, or Ancoats — we&rsquo;ve got someone close.",
    neighbourhoods: [
      "City Centre",
      "Didsbury",
      "Chorlton",
      "Salford",
      "Trafford",
      "Stockport",
      "Ancoats",
      "Altrincham",
    ],
  },
  {
    slug: "birmingham",
    countrySlug: "uk",
    country: "GB",
    city: "Birmingham",
    region: "England",
    blurb:
      "Birmingham&rsquo;s growing community of vetted caregivers — from Edgbaston to Solihull — supports families with childcare, special-needs, and elder care.",
    neighbourhoods: [
      "City Centre",
      "Edgbaston",
      "Moseley",
      "Selly Oak",
      "Sutton Coldfield",
      "Solihull",
      "Harborne",
    ],
  },
  {
    slug: "new-york",
    countrySlug: "us",
    country: "US",
    city: "New York",
    region: "NY",
    blurb:
      "Manhattan, Brooklyn, Queens, the Bronx, and Staten Island. NYC caregivers cleared by Checkr and ready for Manhattan walk-ups, Brooklyn brownstones, or anywhere in between.",
    neighbourhoods: [
      "Manhattan",
      "Brooklyn",
      "Queens",
      "The Bronx",
      "Upper East Side",
      "Williamsburg",
      "Park Slope",
      "Astoria",
    ],
  },
  {
    slug: "los-angeles",
    countrySlug: "us",
    country: "US",
    city: "Los Angeles",
    region: "CA",
    blurb:
      "From the Westside to the Valley, LA caregivers cover childcare, eldercare, and special-needs support across Greater Los Angeles. CNA, HHA, and Newborn Care Specialists available.",
    neighbourhoods: [
      "Santa Monica",
      "West LA",
      "Beverly Hills",
      "Silver Lake",
      "Pasadena",
      "Sherman Oaks",
      "Studio City",
      "Long Beach",
    ],
  },
];

export function getCity(countrySlug: string, citySlug: string): CityEntry | undefined {
  return CITIES.find(
    (c) => c.countrySlug === countrySlug && c.slug === citySlug,
  );
}
