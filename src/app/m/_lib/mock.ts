/**
 * Stand-in data for the mobile app.
 *
 * v1 ships with a static catalog so reviewers can demo the full app
 * flow without depending on live Supabase rows. As real /api routes
 * land, individual screens swap from `MOCK` → `fetch` one at a time.
 */

/**
 * The two delivery formats a caregiver can offer.
 *  - "visiting": hourly visits, billed by the hour
 *  - "live_in": multi-day in-home placement, billed as a weekly rate
 *
 * Naming kept aligned with the backend (`care_formats` column on
 * the caregivers table — `live_in` with underscore) so the same
 * key flows through Supabase without translation.
 */
export type CareFormat = "visiting" | "live_in";

export type Caregiver = {
  id: string;
  name: string;
  photo: string;
  city: string;
  experienceYears: number;
  rating: number;
  reviewCount: number;
  hourly: { gbp: number; usd: number };
  /**
   * Per-week rate for live-in placements. Optional: only set when
   * the carer has opted into live-in via `careFormats`. Industry
   * convention in the UK is to bill live-in as a weekly rate (sleep
   * period included), not by the hour or by the day.
   */
  weekly?: { gbp: number; usd: number };
  /**
   * Which delivery formats this carer offers. Defaults to ["visiting"]
   * when not set. A carer that does live-in placements will list both.
   */
  careFormats: CareFormat[];
  /**
   * Whether this carer holds verified clinical credentials — i.e.
   * can be assigned bookings that involve PEG feeds, injections,
   * controlled drugs, post-operative care, etc. RNs and HCAs with
   * verified Care Certificates qualify; standard companions don't.
   */
  isClinical?: boolean;
  /**
   * Subset of clinical: this carer is a licensed nurse (NMC PIN in
   * the UK; state RN license in the US). Always implies `isClinical`.
   */
  isNurse?: boolean;
  services: ("child" | "elderly" | "special" | "postnatal")[];
  languages: string[];
  about: string;
  certifications: { title: string; issuedAt: string }[];
  availability: { day: string; slots: string[] }[];
  reviews: {
    id: string;
    author: string;
    avatar: string;
    rating: number;
    when: string;
    service: "Childcare" | "Elderly care" | "Postnatal support" | "Special-needs";
    text: string;
  }[];
};

export const CARE_FORMAT_LABEL: Record<CareFormat, string> = {
  visiting: "Visiting care",
  live_in: "Live-in care",
};

export const CARE_FORMAT_BLURB: Record<CareFormat, string> = {
  visiting:
    "A carer comes to your home for booked hours, then leaves at the end of the visit. Billed by the hour.",
  live_in:
    "A carer moves into your home for the placement, providing daytime support and overnight peace of mind. Billed as a weekly rate.",
};

const STOCK = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400",
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400",
  "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400",
  "https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=400",
];

const SAMPLE_AVAIL = [
  { day: "Monday", slots: ["10:00 AM - 12:00 PM", "3:00 PM - 6:00 PM"] },
  { day: "Tuesday", slots: ["10:00 AM - 12:00 PM", "3:00 PM - 6:00 PM"] },
  { day: "Wednesday", slots: ["9:00 AM - 12:00 PM", "2:00 PM - 5:00 PM"] },
  { day: "Thursday", slots: ["10:00 AM - 12:00 PM"] },
  { day: "Friday", slots: ["10:00 AM - 12:00 PM", "3:00 PM - 6:00 PM"] },
  { day: "Saturday", slots: ["10:00 AM - 12:00 PM"] },
];

export const CAREGIVERS: Caregiver[] = [
  {
    id: "carer_aisha",
    name: "Aisha Patel",
    photo: STOCK[0],
    city: "Brooklyn, NY",
    experienceYears: 6,
    rating: 4.8,
    reviewCount: 142,
    hourly: { gbp: 22, usd: 29 },
    weekly: { gbp: 1100, usd: 1450 },
    careFormats: ["visiting", "live_in"],
    isClinical: true,
    isNurse: true,
    services: ["child", "elderly", "special"],
    languages: ["English", "Hindi", "Bengali"],
    about:
      "NMC-registered nurse turned community carer. 6+ years supporting families across childcare and adult care, with clinical experience in dementia care, post-operative recovery, and medication administration. CRB & DBS cleared, first-aid certified, bilingual (English / Hindi / Bengali).",
    certifications: [
      { title: "NMC Registered Nurse", issuedAt: "05 Jun 2018" },
      { title: "DBS Enhanced", issuedAt: "16 Apr 2024" },
      { title: "First Aid (Pediatric)", issuedAt: "02 Jan 2025" },
      { title: "Dementia Care Level 3", issuedAt: "11 Sep 2024" },
    ],
    availability: SAMPLE_AVAIL,
    reviews: [
      {
        id: "r1",
        author: "Bessie Cooper",
        avatar: STOCK[1],
        rating: 5,
        when: "14 Apr 25",
        service: "Childcare",
        text: "She did an amazing job — she's very creative, detailed and easy to work with. Our boys adored her.",
      },
      {
        id: "r2",
        author: "Marvin McKinney",
        avatar: STOCK[2],
        rating: 5,
        when: "02 Mar 25",
        service: "Elderly care",
        text: "Aisha treated my dad with so much patience. Punctual every visit and kept us informed.",
      },
      {
        id: "r3",
        author: "Sara Lin",
        avatar: STOCK[3],
        rating: 4,
        when: "10 Feb 25",
        service: "Childcare",
        text: "Lovely person. Would book again — very organised with mealtimes and the kids loved her.",
      },
    ],
  },
  {
    id: "carer_rachel",
    name: "Rachel Green",
    photo: STOCK[1],
    city: "Manchester, UK",
    experienceYears: 8,
    rating: 4.9,
    reviewCount: 218,
    hourly: { gbp: 18, usd: 25 },
    careFormats: ["visiting"],
    services: ["child", "postnatal"],
    languages: ["English", "Polish"],
    about:
      "Maternity-trained nurse turned postnatal carer. I help new families during the first 12 weeks — feeding routines, sleep coaching, light housekeeping while you rest.",
    certifications: [
      { title: "DBS Enhanced", issuedAt: "10 Jan 2025" },
      { title: "Postnatal Support Level 4", issuedAt: "22 Jul 2024" },
    ],
    availability: SAMPLE_AVAIL,
    reviews: [
      {
        id: "r1",
        author: "Bessie Cooper",
        avatar: STOCK[3],
        rating: 5,
        when: "14 Apr 25",
        service: "Postnatal support",
        text: "Rachel was a lifeline in those first weeks. Calm, capable, kind.",
      },
    ],
  },
  {
    id: "carer_marvin",
    name: "Marvin McKinney",
    photo: STOCK[2],
    city: "Birmingham, UK",
    experienceYears: 5,
    rating: 4.6,
    reviewCount: 88,
    hourly: { gbp: 19, usd: 26 },
    weekly: { gbp: 950, usd: 1300 },
    careFormats: ["visiting", "live_in"],
    isClinical: true,
    services: ["elderly", "special"],
    languages: ["English"],
    about:
      "HCA-trained adult-care specialist with verified clinical credentials. Experienced supporting Parkinson's, post-stroke recovery, PEG-feed routines and controlled-drug administration. I focus on dignity, mobility and small daily wins.",
    certifications: [
      { title: "Care Certificate", issuedAt: "22 May 2023" },
      { title: "PEG Feeding (RCN-certified)", issuedAt: "10 Oct 2024" },
      { title: "DBS Enhanced", issuedAt: "08 Aug 2024" },
      { title: "Manual Handling Level 2", issuedAt: "15 Mar 2024" },
    ],
    availability: SAMPLE_AVAIL,
    reviews: [],
  },
  {
    id: "carer_emma",
    name: "Emma Williams",
    photo: STOCK[4],
    city: "Allentown, NM",
    experienceYears: 6,
    rating: 4.7,
    reviewCount: 96,
    hourly: { gbp: 20, usd: 27 },
    weekly: { gbp: 1000, usd: 1350 },
    careFormats: ["visiting", "live_in"],
    services: ["child", "elderly", "special"],
    languages: ["English", "Spanish"],
    about:
      "I bring six years of bilingual care experience — equally comfortable with toddlers and seniors. Background in early-years education, current first-aid certification.",
    certifications: [
      { title: "DBS Enhanced", issuedAt: "05 Feb 2025" },
      { title: "First Aid", issuedAt: "12 Apr 2024" },
      { title: "Early Years Level 3", issuedAt: "20 Sep 2023" },
    ],
    availability: SAMPLE_AVAIL,
    reviews: [
      {
        id: "r1",
        author: "Wade Warren",
        avatar: STOCK[5],
        rating: 5,
        when: "21 Mar 25",
        service: "Childcare",
        text: "Emma is patient and warm. Our daughter actually looks forward to her visits.",
      },
    ],
  },
  {
    id: "carer_ronald",
    name: "Ronald Richards",
    photo: STOCK[5],
    city: "Bristol, UK",
    experienceYears: 4,
    rating: 4.5,
    reviewCount: 51,
    hourly: { gbp: 18, usd: 24 },
    careFormats: ["visiting"],
    services: ["child"],
    languages: ["English"],
    about:
      "Energetic dad-of-two who loves working with active kids. Great at homework support, outdoor play and managing siblings.",
    certifications: [
      { title: "DBS Enhanced", issuedAt: "01 Mar 2024" },
    ],
    availability: SAMPLE_AVAIL,
    reviews: [],
  },
];

export type BookingStatus = "Requested" | "Accepted" | "Completed" | "Rejected";

export type Booking = {
  id: string;
  carerId: string;
  status: BookingStatus;
  service: "Childcare" | "Elderly care" | "Postnatal support" | "Special-needs";
  address: string;
  date: string; // human-readable
  time: string; // e.g. "10:00AM - 11:00AM"
  slot: number;
  notes?: string;
};

export const BOOKINGS: Booking[] = [
  {
    id: "bk_001",
    carerId: "carer_rachel",
    status: "Requested",
    service: "Childcare",
    address: "6391 Elgin St., Celina",
    date: "14 Apr, 2026",
    time: "10:00AM - 11:00AM",
    slot: 1,
    notes: "Two kids, ages 4 and 6. Lunch already prepared.",
  },
  {
    id: "bk_002",
    carerId: "carer_marvin",
    status: "Accepted",
    service: "Elderly care",
    address: "6391 Elgin St., Celina",
    date: "14 Apr, 2026",
    time: "10:00AM - 11:00AM",
    slot: 1,
  },
  {
    id: "bk_003",
    carerId: "carer_aisha",
    status: "Completed",
    service: "Childcare",
    address: "21 Baker Lane, Manchester",
    date: "02 Mar, 2026",
    time: "9:00AM - 12:00PM",
    slot: 2,
  },
  {
    id: "bk_004",
    carerId: "carer_emma",
    status: "Rejected",
    service: "Special-needs",
    address: "8 Park Avenue, Bristol",
    date: "20 Feb, 2026",
    time: "2:00PM - 4:00PM",
    slot: 1,
  },
];

/* ──────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────── */

export function getCarer(id: string): Caregiver | undefined {
  return CAREGIVERS.find((c) => c.id === id);
}

// Marketing-site canonical names (homepage hero + how-it-works).
// Keep these in sync with /find-care and /how-it-works.
export const SERVICE_LABEL: Record<Caregiver["services"][number], string> = {
  child: "Childcare",
  elderly: "Elderly care",
  special: "Special-needs",
  postnatal: "Postnatal support",
};

export const STATUS_TONE: Record<
  BookingStatus,
  "amber" | "green" | "red" | "neutral"
> = {
  Requested: "amber",
  Accepted: "green",
  Completed: "neutral",
  Rejected: "red",
};

// ---- Chat ----------------------------------------------------------------

export type ChatPreview = {
  id: string;
  carerId: string;
  lastMessage: string;
  when: string;
  unread: number;
};

export type ChatMessage = {
  id: string;
  fromMe: boolean;
  text: string;
  time: string;
};

export const CHATS: ChatPreview[] = [
  { id: "ch1", carerId: "carer_aisha", lastMessage: "Sure, I'll be there at 10.", when: "10:24", unread: 2 },
  { id: "ch2", carerId: "carer_marcus", lastMessage: "Thanks for booking!", when: "Yesterday", unread: 0 },
  { id: "ch3", carerId: "carer_grace", lastMessage: "Could you share the address?", when: "Mon", unread: 1 },
  { id: "ch4", carerId: "carer_olivia", lastMessage: "See you on Friday.", when: "21 Apr", unread: 0 },
];

export const CHAT_THREAD: Record<string, ChatMessage[]> = {
  ch1: [
    { id: "m1", fromMe: false, text: "Hi! Looking forward to meeting you tomorrow.", time: "09:42" },
    { id: "m2", fromMe: true, text: "Hi Aisha, same here. The little one is excited.", time: "09:50" },
    { id: "m3", fromMe: false, text: "Should I bring anything special?", time: "10:01" },
    { id: "m4", fromMe: true, text: "Just yourself — we have everything ready.", time: "10:10" },
    { id: "m5", fromMe: false, text: "Sure, I'll be there at 10.", time: "10:24" },
  ],
};

export function getChat(id: string) {
  const preview = CHATS.find((c) => c.id === id);
  if (!preview) return undefined;
  const carer = getCarer(preview.carerId);
  const thread = CHAT_THREAD[id] ?? [];
  return { preview, carer, thread };
}

// ---- Carer-side jobs feed -------------------------------------------------

export type JobStatus = "Open" | "Applied" | "Closed";

// Weekly availability grid: 7 rows (Sun..Sat) x 4 cols (Morning, Afternoon, Evening, Night)
export type DaySlots = [boolean, boolean, boolean, boolean];
export type AvailabilityGrid = [DaySlots, DaySlots, DaySlots, DaySlots, DaySlots, DaySlots, DaySlots];

export const TIME_SLOT_LABELS = ["Morning", "Afternoon", "Evening", "Night"] as const;
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type Job = {
  id: string;
  displayId: string; // e.g. #00606272
  title: string;
  service: keyof typeof SERVICE_LABEL;
  city: string;
  postedBy: string;
  postedAvatar: string;
  postedAgo: string;
  hourly: { gbp: number; usd: number };
  hoursPerWeek: string;
  hoursPerWeekNum: number;
  startDate: string;
  daysPerWeek: string; // e.g. "Flexible", "3 days a week"
  description: string;
  requirements: string[];
  careNeeds: string[];
  qualifications: string[];
  availability: AvailabilityGrid;
  status: JobStatus;
};

// Helper to build a grid: pass an array of [dayIndex, slotIndex] tuples.
function grid(cells: Array<[number, number]>): AvailabilityGrid {
  const g: boolean[][] = Array.from({ length: 7 }, () => [false, false, false, false]);
  for (const [d, s] of cells) g[d][s] = true;
  return g.map((r) => r as DaySlots) as AvailabilityGrid;
}

export const JOBS: Job[] = [
  {
    id: "job_001",
    displayId: "#00606272",
    title: "Looking for an experienced child carer",
    service: "child",
    city: "Camden, London",
    postedBy: "Bessie Cooper",
    postedAvatar: STOCK[1],
    postedAgo: "2h ago",
    hourly: { gbp: 22, usd: 28 },
    hoursPerWeek: "12-15 hrs/week",
    hoursPerWeekNum: 12,
    startDate: "Mon 11 May",
    daysPerWeek: "Flexible days a week",
    description:
      "Hi, we're looking for a kind, reliable carer to look after our 4-year-old in the afternoons. School pick-up, light meals, homework help and a bit of play. We live near Regent's Park.",
    requirements: [
      "DBS Enhanced",
      "Pediatric First Aid",
      "Min 3 years experience",
      "Non-smoker",
    ],
    careNeeds: ["Meal Prep", "Light Housekeeping", "School Pick-up", "Homework Help"],
    qualifications: [
      "Live-out preferred",
      "Speaks English",
      "Female preferred",
      "Passed background check",
      "Access to vehicle",
    ],
    availability: grid([
      [1, 1], [1, 2],
      [2, 1], [2, 2],
      [3, 1], [3, 2],
      [4, 1], [4, 2],
      [5, 1], [5, 2],
    ]),
    status: "Open",
  },
  {
    id: "job_002",
    displayId: "#00606273",
    title: "Weekend elderly care companion",
    service: "elderly",
    city: "Manchester",
    postedBy: "Robert Fox",
    postedAvatar: STOCK[2],
    postedAgo: "Yesterday",
    hourly: { gbp: 20, usd: 26 },
    hoursPerWeek: "8 hrs/weekend",
    hoursPerWeekNum: 8,
    startDate: "Sat 16 May",
    daysPerWeek: "2 days a week",
    description:
      "My mother needs a companion on Saturdays — light housekeeping, meal prep, conversation and a short walk if the weather is good.",
    requirements: ["DBS Enhanced", "Manual Handling", "Driving licence preferred"],
    careNeeds: ["Bathing", "Dressing & Grooming", "Meal Prep", "Housekeeping"],
    qualifications: [
      "Live-out preferred",
      "Speaks English",
      "Passed background check",
      "Access to vehicle",
    ],
    availability: grid([
      [0, 0], [0, 1], [0, 2],
      [6, 0], [6, 1], [6, 2],
    ]),
    status: "Open",
  },
  {
    id: "job_003",
    displayId: "#00606274",
    title: "Special-needs support, after school",
    service: "special",
    city: "Bristol",
    postedBy: "Cody Fisher",
    postedAvatar: STOCK[3],
    postedAgo: "3 days ago",
    hourly: { gbp: 24, usd: 30 },
    hoursPerWeek: "10 hrs/week",
    hoursPerWeekNum: 10,
    startDate: "Mon 18 May",
    daysPerWeek: "5 days a week",
    description:
      "Our 9-year-old has autism and needs a patient, structured carer for after-school routine, homework support and play.",
    requirements: ["DBS Enhanced", "SEN experience", "Calm temperament"],
    careNeeds: ["School Pick-up", "Homework Help", "Sensory-friendly Play", "Meal Prep"],
    qualifications: [
      "SEN experience required",
      "Speaks English",
      "Passed background check",
      "Calm temperament",
    ],
    availability: grid([
      [1, 1], [1, 2],
      [2, 1], [2, 2],
      [3, 1], [3, 2],
      [4, 1], [4, 2],
      [5, 1], [5, 2],
    ]),
    status: "Applied",
  },
  {
    id: "job_004",
    displayId: "#00606275",
    title: "Postnatal night-time support",
    service: "postnatal",
    city: "Edinburgh",
    postedBy: "Jenny Wilson",
    postedAvatar: STOCK[4],
    postedAgo: "5 days ago",
    hourly: { gbp: 26, usd: 32 },
    hoursPerWeek: "Nights, 4×/week",
    hoursPerWeekNum: 32,
    startDate: "ASAP",
    daysPerWeek: "4 nights a week",
    description:
      "Looking for an experienced postnatal carer to support overnight feeds and routines. Twins, both healthy.",
    requirements: ["Maternity Nurse cert", "Twin experience", "References"],
    careNeeds: ["Overnight Feeds", "Sleep Routine", "Bathing", "Light Housekeeping"],
    qualifications: [
      "Live-out preferred",
      "Female preferred",
      "Speaks English",
      "Passed background check",
      "Twin experience",
    ],
    availability: grid([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]),
    status: "Open",
  },
];

export function getJob(id: string): Job | undefined {
  return JOBS.find((j) => j.id === id);
}

// ---- Notifications --------------------------------------------------------

/**
 * Notification feed shown when the seeker taps the bell. Real data
 * will come from a `notifications` table on Supabase keyed by user_id;
 * for now we stub a representative mix of booking-status updates,
 * messages, and platform announcements so reviewers can see the
 * empty/non-empty branches of the UI.
 */
export type NotificationKind =
  | "booking_accepted"
  | "booking_completed"
  | "booking_requested"
  | "message"
  | "system";

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Relative time string for v1; switch to ISO + client-side fmt later. */
  when: string;
  /** Optional deeplink \u2014 tapping the notification routes here. */
  href?: string;
  read: boolean;
};

export const NOTIFICATIONS: AppNotification[] = [
  {
    id: "n1",
    kind: "booking_accepted",
    title: "Marvin accepted your booking",
    body: "Elderly care · 14 Apr · 10:00 AM \u2013 11:00 AM. Your card has been authorised.",
    when: "10 min ago",
    href: "/m/bookings/bk_002",
    read: false,
  },
  {
    id: "n2",
    kind: "message",
    title: "New message from Aisha",
    body: "Sure, I'll be there at 10. Looking forward to meeting the kids.",
    when: "1 hr ago",
    href: "/m/chat/ch1",
    read: false,
  },
  {
    id: "n3",
    kind: "booking_completed",
    title: "Booking complete",
    body: "Your booking with Aisha on 02 Mar is complete. Tap to leave a review.",
    when: "Yesterday",
    href: "/m/bookings/bk_003",
    read: true,
  },
  {
    id: "n4",
    kind: "system",
    title: "Welcome to SpecialCarer",
    body: "Verified carers, transparent pricing, and 24/7 support \u2014 we're glad you're here.",
    when: "3 days ago",
    read: true,
  },
];
