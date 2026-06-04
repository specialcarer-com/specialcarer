import { US_REGION_ENABLED } from "@/lib/region";

export type CityEntry = {
  slug: string;
  countrySlug: "uk" | "us";
  country: "GB" | "US";
  city: string; // canonical city name (matches caregiver_profiles.city case-insensitively)
  region: string; // displayed region/state
  blurb: string;
  neighbourhoods: string[]; // marketing copy only
};

const UK_CITIES: CityEntry[] = [
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
    slug: "bristol",
    countrySlug: "uk",
    country: "GB",
    city: "Bristol",
    region: "England",
    blurb:
      "Vetted Bristol caregivers across Clifton, Bedminster, Redland, and the wider city — supporting families with childcare, elder care, and special-needs support.",
    neighbourhoods: [
      "Clifton",
      "Bedminster",
      "Redland",
      "Bishopston",
      "Southville",
      "Stokes Croft",
    ],
  },
  {
    slug: "cardiff",
    countrySlug: "uk",
    country: "GB",
    city: "Cardiff",
    region: "Wales",
    blurb:
      "Cardiff caregivers covering Cathays, Roath, Pontcanna, and the bay — DBS-checked and ready for one-off bookings or recurring schedules.",
    neighbourhoods: [
      "Cathays",
      "Roath",
      "Pontcanna",
      "Canton",
      "Cardiff Bay",
      "Llanishen",
    ],
  },
  {
    slug: "edinburgh",
    countrySlug: "uk",
    country: "GB",
    city: "Edinburgh",
    region: "Scotland",
    blurb:
      "Edinburgh caregivers from Leith to Morningside — vetted, background-checked, and ready to support families across the city.",
    neighbourhoods: [
      "Leith",
      "Morningside",
      "Stockbridge",
      "Newington",
      "Portobello",
      "Corstorphine",
    ],
  },
  {
    slug: "glasgow",
    countrySlug: "uk",
    country: "GB",
    city: "Glasgow",
    region: "Scotland",
    blurb:
      "Glasgow caregivers covering the West End, Southside, and city centre — supporting families with childcare, elder care, and complex care.",
    neighbourhoods: [
      "West End",
      "Southside",
      "City Centre",
      "Dennistoun",
      "Shawlands",
      "Partick",
    ],
  },
  {
    slug: "leeds",
    countrySlug: "uk",
    country: "GB",
    city: "Leeds",
    region: "England",
    blurb:
      "Leeds caregivers across Headingley, Chapel Allerton, and the wider city — DBS-checked and ready for one-off or recurring care.",
    neighbourhoods: [
      "Headingley",
      "Chapel Allerton",
      "Roundhay",
      "Horsforth",
      "City Centre",
      "Meanwood",
    ],
  },
  {
    slug: "liverpool",
    countrySlug: "uk",
    country: "GB",
    city: "Liverpool",
    region: "England",
    blurb:
      "Liverpool caregivers from the city centre to Allerton and Woolton — vetted, background-checked, and ready to support local families.",
    neighbourhoods: [
      "City Centre",
      "Allerton",
      "Woolton",
      "Aigburth",
      "Wavertree",
      "Crosby",
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
    slug: "newcastle",
    countrySlug: "uk",
    country: "GB",
    city: "Newcastle",
    region: "England",
    blurb:
      "Newcastle caregivers across Jesmond, Gosforth, Heaton, and the city centre — supporting families with childcare, elder care, and special-needs support.",
    neighbourhoods: [
      "Jesmond",
      "Gosforth",
      "Heaton",
      "City Centre",
      "Gateshead",
      "Tynemouth",
    ],
  },
];

// US cities are kept here behind the NEXT_PUBLIC_REGION_US_ENABLED flag.
// They are hidden from production until the US launch (expected 2027).
const US_CITIES: CityEntry[] = [
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

export const CITIES: CityEntry[] = US_REGION_ENABLED
  ? [...UK_CITIES, ...US_CITIES]
  : UK_CITIES;

export function getCity(countrySlug: string, citySlug: string): CityEntry | undefined {
  return CITIES.find(
    (c) => c.countrySlug === countrySlug && c.slug === citySlug,
  );
}
