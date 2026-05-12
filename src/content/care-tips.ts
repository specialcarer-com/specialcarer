import type { CareTip } from "@/lib/care-tips/types";

/**
 * Curated care-tip library. Genuine UK-flavoured advice, ~50-100 words each.
 * Seeded across all 5 verticals × all 12 months × both audiences. Designed
 * to be swapped for a Supabase-backed source in a future PR (see
 * `CareTipsSource` interface).
 */
export const CARE_TIPS: CareTip[] = [
  // ── Elderly care ─────────────────────────────────────────────
  {
    id: "elderly-winter-hydration",
    title: "Cold weather: keep older relatives hydrated",
    body:
      "Older adults often don't feel thirsty even when dehydrated. In winter, central heating dries them out fast. Aim for a warm drink every two hours — tea, soup, weak squash all count. Place a clear glass within reach by the chair and refill it whenever you walk past. A dry tongue or sunken eyes are late signs; don't wait for those.",
    audience: "both",
    verticals: ["elderly_care"],
    months: [11, 12, 1, 2],
    tags: ["hydration", "winter"],
  },
  {
    id: "elderly-winter-slips",
    title: "Slip-proof the porch before the frost arrives",
    body:
      "Most winter falls happen on the threshold — wet leaves, then black ice. Put rubberised mats inside and out, replace worn slippers, and keep a tub of grit (or even cat litter) by the front door. If your relative uses a stick, swap the rubber ferrule yearly; the grip wears smooth without anyone noticing.",
    audience: "both",
    verticals: ["elderly_care"],
    months: [10, 11, 12, 1, 2, 3],
    tags: ["falls", "winter"],
  },
  {
    id: "elderly-flu-jab",
    title: "Flu jab and Covid booster — book together",
    body:
      "From early October, over-65s in the UK can get both the flu vaccine and seasonal Covid booster at the same visit, often at the same pharmacy. Booking together saves a trip and cuts the brief immune dip after each shot. Ask the GP about pneumococcal cover too if it's been more than five years.",
    audience: "seeker",
    verticals: ["elderly_care"],
    months: [9, 10, 11],
    tags: ["vaccines", "winter"],
  },
  {
    id: "elderly-summer-heat",
    title: "Summer heat: watch for heatstroke signs",
    body:
      "Elderly bodies regulate temperature poorly. On days over 27°C, close curtains on the sunny side from late morning, keep fluids cold and frequent, and avoid the strongest sun between 11am-3pm. Confusion, a flushed-but-dry face, and a faster pulse are early heatstroke flags — cool them down and call 111 if it doesn't lift in 30 minutes.",
    audience: "both",
    verticals: ["elderly_care"],
    months: [6, 7, 8],
    tags: ["summer", "heat"],
  },

  // ── Childcare ────────────────────────────────────────────────
  {
    id: "child-summer-sun",
    title: "Sun safety for under-fives",
    body:
      "Children's skin burns in minutes. Apply broad-spectrum SPF 50 fifteen minutes before going out and top up every two hours — and after every paddling pool session, even 'water-resistant' brands. A wide-brim hat beats a cap, and a UV-protective rash vest at the beach saves a lot of cream. Keep babies under six months in the shade entirely.",
    audience: "both",
    verticals: ["childcare"],
    months: [5, 6, 7, 8, 9],
    tags: ["sun-safety", "summer"],
  },
  {
    id: "child-paddling-pool",
    title: "Paddling pools: stay within arm's reach",
    body:
      "A toddler can drown in two inches of water in under a minute, silently. Stay within arm's reach the entire time the pool is up, empty it immediately after, and tip it upside down so it can't refill in the rain. Don't rely on inflatable rings — they're not flotation devices and can flip in a heartbeat.",
    audience: "both",
    verticals: ["childcare"],
    months: [6, 7, 8],
    tags: ["safety", "summer"],
  },
  {
    id: "child-winter-layers",
    title: "Layering toddlers for cold weather",
    body:
      "Three thin layers trap warmth better than one thick coat — and you can peel them off when the bus is overheated. Cotton or merino base, fleece middle, waterproof shell. Mittens beat gloves for the under-threes. In car seats, never strap a child in over a thick coat: tighten on the body, then drape the coat backwards over the harness.",
    audience: "both",
    verticals: ["childcare"],
    months: [11, 12, 1, 2],
    tags: ["winter", "safety"],
  },
  {
    id: "child-yearround-routine",
    title: "Why predictable routines settle kids fast",
    body:
      "Children thrive on knowing what comes next. A simple visual schedule (pictures for under-fives, words from age six) cuts transition tantrums dramatically. Keep the order the same even if the timing slips — wake, dress, breakfast, brush teeth — and signal the move with a song or a phrase rather than a stopwatch.",
    audience: "caregiver",
    verticals: ["childcare"],
    months: [],
    tags: ["routine", "behaviour"],
  },

  // ── Special needs ────────────────────────────────────────────
  {
    id: "sn-sensory-regulation",
    title: "Sensory toolkits for overwhelm moments",
    body:
      "Stock a small bag with three options: deep-pressure (weighted lap pad), oral-motor (chewy or water bottle with straw), and proprioceptive (resistance band, theraputty). Offer the option, don't impose it — and trust the child's choice. The most useful tool is often the one adults don't notice. Refresh the bag every term; sensory needs drift with growth.",
    audience: "both",
    verticals: ["special_needs"],
    months: [],
    tags: ["sensory", "regulation"],
  },
  {
    id: "sn-transitions",
    title: "Smoother transitions with timers and warnings",
    body:
      "Sudden changes are the hardest. Give a 5-minute warning, then 2-minute, then 30-second — visual sand timers or a quiet phone alarm both work. For activities the child loves, allow a 'taking-with' object as a bridge to the next setting. Resistance often isn't defiance; it's the cost of switching gears with a different brain.",
    audience: "both",
    verticals: ["special_needs"],
    months: [],
    tags: ["transitions"],
  },
  {
    id: "sn-summer-school",
    title: "Bridging the summer break for ASD/ADHD kids",
    body:
      "Six weeks without school structure undoes a lot of progress. Keep a printable weekly chart even if it's loose — wake, breakfast, one outing, lunch, calm hour, snack, outdoor play, dinner, wind-down. Build in 'first this, then that' choices to preserve agency. Visit the new classroom in late August if there's a move coming.",
    audience: "seeker",
    verticals: ["special_needs"],
    months: [7, 8],
    tags: ["summer", "school"],
  },

  // ── Postnatal ────────────────────────────────────────────────
  {
    id: "postnatal-safe-sleep-winter",
    title: "Safe sleep: how warm is too warm?",
    body:
      "Babies overheat fastest in winter when the heating's on. Aim for a 16-20°C nursery, use a TOG-appropriate sleeping bag (2.5 in winter, 1.0 in summer), and check the back of the neck — not hands or feet — for warmth. Always back to sleep, on a firm flat mattress, with no pillows, bumpers, or loose bedding under six months.",
    audience: "seeker",
    verticals: ["postnatal"],
    months: [11, 12, 1, 2, 3],
    tags: ["sleep", "safety", "winter"],
  },
  {
    id: "postnatal-safe-sleep-summer",
    title: "Safe sleep in hot weather",
    body:
      "On warm nights, strip the cot to a fitted sheet and use a 0.5-1.0 TOG sleeping bag (or just a vest if it's truly hot). A small fan moving air across the room helps — point it at the wall, not the baby. Never cover a pram with a muslin or blanket; it can cause the temperature inside to spike within minutes.",
    audience: "seeker",
    verticals: ["postnatal"],
    months: [5, 6, 7, 8, 9],
    tags: ["sleep", "safety", "summer"],
  },
  {
    id: "postnatal-feeding-posture",
    title: "Feeding posture that saves your neck",
    body:
      "Hours of looking down wreck shoulders. Bring the baby up to the breast or bottle, not your back down to them — pillows on your lap, feet flat or slightly raised. Switch sides each feed (and arms with bottles) to balance the load. If your right trapezius is screaming by week three, you're not 'just tired'; the position needs fixing.",
    audience: "seeker",
    verticals: ["postnatal"],
    months: [],
    tags: ["feeding", "posture"],
  },

  // ── Complex care ─────────────────────────────────────────────
  {
    id: "complex-meds-review",
    title: "Quarterly medication review",
    body:
      "Polypharmacy creeps. Every three months, ask the GP or community pharmacist for a structured review: what's still needed, what could be deprescribed, and what interactions changed when something was added. Bring the actual boxes — labels mismatch what the GP record says more often than you'd expect. Take notes; one-off chats don't stick.",
    audience: "both",
    verticals: ["complex_care"],
    months: [],
    tags: ["medication"],
  },
  {
    id: "complex-peg-site",
    title: "PEG site checks: daily, weekly, monthly",
    body:
      "Daily: clean around the stoma with cooled boiled water, look for redness or discharge. Weekly: rotate the tube 360° to prevent buried-bumper, check the external bumper sits a few millimetres clear of the skin. Monthly: log the tube length at the skin so any migration is obvious. Photograph the site monthly and share with the home enteral-feed nurse.",
    audience: "both",
    verticals: ["complex_care"],
    months: [],
    tags: ["enteral-feeding", "skin"],
  },

  // ── Carer-audience tips ──────────────────────────────────────
  {
    id: "carer-lone-worker",
    title: "Lone worker check-in: don't skip it",
    body:
      "Even one missed check-in is a flag. Set a recurring alarm to message your coordinator (or a family member if self-employed) at the start and end of each shift, plus an SOS shortcut on your phone home screen. The two minutes feel pointless on every normal day — and exactly right on the one day it isn't.",
    audience: "caregiver",
    verticals: [],
    months: [],
    tags: ["safety", "lone-working"],
  },
  {
    id: "carer-manual-handling",
    title: "Refresh your manual-handling fundamentals",
    body:
      "Most back injuries don't come from one big lift; they come from a thousand small twists. Drop your hips, not your shoulders; bring the person close before moving; never lift across your body. If a hoist is indicated, use it — even for a 'quick' transfer. A 20-minute online refresher every six months is worth more than you'd think.",
    audience: "caregiver",
    verticals: ["elderly_care", "complex_care", "special_needs"],
    months: [],
    tags: ["safety", "manual-handling"],
  },
  {
    id: "carer-burnout-signs",
    title: "Spotting your own burnout early",
    body:
      "Dread on the morning of a shift you usually enjoy; sleep that doesn't refresh; a shorter fuse with your own family. These are early signals, not weakness. Block at least one full day off per week (a real day, phone-off), use leave before you 'need' it, and talk to your GP or coordinator before symptoms compound. You're a finite resource.",
    audience: "caregiver",
    verticals: [],
    months: [],
    tags: ["wellbeing", "burnout"],
  },
  {
    id: "carer-winter-lifting",
    title: "Cold muscles + lifting = injury",
    body:
      "In winter, give yourself two extra minutes before the first physical task — gentle shoulder rolls, hip circles, a brisk walk inside. Cold tissue tears at lower loads than warm. Keep a thermal vest in the car; you'll be glad of it on the 6am school run before a transfer day. Hydrate even when you don't feel thirsty — heating dries you out too.",
    audience: "caregiver",
    verticals: [],
    months: [11, 12, 1, 2],
    tags: ["winter", "safety", "manual-handling"],
  },

  // ── Spring / autumn fillers ─────────────────────────────────
  {
    id: "spring-allergies",
    title: "Spring pollen plans for sensitive kids",
    body:
      "Hayfever in under-twelves often presents as crankiness and 'I can't sleep', not the classic sneeze-and-itch. Check pollen counts on the Met Office app, change clothes after the park, and shower hair at bedtime to wash pollen off. A nightly nasal saline rinse is safe from age two and cuts antihistamine use noticeably.",
    audience: "seeker",
    verticals: ["childcare", "special_needs"],
    months: [3, 4, 5, 6],
    tags: ["allergies", "spring"],
  },
  {
    id: "autumn-clocks-back",
    title: "Clocks go back: protect sleep for two weeks",
    body:
      "The October hour-back hits routines harder than parents expect. For a fortnight before, shift bedtime 10 minutes later every other day; afterwards, blackout blinds in the morning and an earlier dimmer in the evening help reset. Older relatives notice it too — keep dinner timed by the clock, not the dusk, to anchor the body clock.",
    audience: "both",
    verticals: ["elderly_care", "childcare", "postnatal"],
    months: [10, 11],
    tags: ["sleep", "routine", "autumn"],
  },
];
