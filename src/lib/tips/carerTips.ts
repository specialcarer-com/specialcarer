/**
 * Carer "Tip of the day" content.
 *
 * A flat, ordered list rotated one-per-day by `selectTipForDate`. Keep the
 * list append-only where possible so the day-of-year rotation stays roughly
 * stable for returning carers. Bodies are UK English, one to two sentences,
 * professional in tone, and contain no emoji.
 */

export type TipCategory =
  | "safety"
  | "communication"
  | "professional growth"
  | "self-care"
  | "platform";

export type Tip = {
  id: string;
  category: TipCategory;
  body: string;
};

export const CARER_TIPS: Tip[] = [
  // ── Safety ───────────────────────────────────────────────────────────
  {
    id: "safety-incident-same-day",
    category: "safety",
    body: "Log incident reports the same day, even minor ones. The Quick-log button on your active job screen captures the timestamp automatically.",
  },
  {
    id: "safety-moving-handling",
    category: "safety",
    body: "Never attempt a transfer you are not trained for. If a client needs more support than the care plan covers, pause and flag it before lifting.",
  },
  {
    id: "safety-medication-check",
    category: "safety",
    body: "Check the name, dose, and time against the medication record before administering anything. When in doubt, withhold and contact the office.",
  },
  {
    id: "safety-trip-hazards",
    category: "safety",
    body: "Take thirty seconds on arrival to clear trip hazards such as loose rugs and trailing cables. Most falls in the home are preventable.",
  },
  {
    id: "safety-lone-working",
    category: "safety",
    body: "Share your visit schedule with a trusted contact when lone working. Keep your phone charged and within reach throughout the shift.",
  },
  {
    id: "safety-safeguarding-voice",
    category: "safety",
    body: "If something feels wrong, raise a safeguarding concern even without proof. It is always better to report and be reassured than to stay silent.",
  },
  {
    id: "safety-infection-control",
    category: "safety",
    body: "Wash your hands before and after every personal care task, and change gloves between tasks. Good hand hygiene is your strongest protection.",
  },

  // ── Communication ────────────────────────────────────────────────────
  {
    id: "comm-reply-quickly",
    category: "communication",
    body: "Reply to new invites within thirty minutes where you can. Quick responders are offered nearby jobs first and build trust with families faster.",
  },
  {
    id: "comm-handover-notes",
    category: "communication",
    body: "Write handover notes as if the next carer has never met the client. Clear, factual notes prevent care from slipping between visits.",
  },
  {
    id: "comm-active-listening",
    category: "communication",
    body: "Give the client your full attention before reaching for the next task. A few minutes of genuine listening often reveals what truly matters to them.",
  },
  {
    id: "comm-family-updates",
    category: "communication",
    body: "Keep families informed with brief, regular updates through the in-app chat. A short message after a visit reassures relatives who cannot be there.",
  },
  {
    id: "comm-plain-language",
    category: "communication",
    body: "Avoid jargon when explaining care to clients and relatives. Plain, warm language helps people feel involved rather than spoken over.",
  },
  {
    id: "comm-confirm-understanding",
    category: "communication",
    body: "When giving instructions about medication or appointments, ask the client to repeat them back. It confirms understanding without sounding patronising.",
  },

  // ── Professional growth ──────────────────────────────────────────────
  {
    id: "growth-add-certification",
    category: "professional growth",
    body: "Adding a recognised certification such as first aid, dementia care, or moving and handling unlocks higher-paying shifts on your profile.",
  },
  {
    id: "growth-reflective-practice",
    category: "professional growth",
    body: "Spend a few minutes after a difficult visit reflecting on what went well and what you would change. Reflective practice is how good carers become great.",
  },
  {
    id: "growth-ask-for-feedback",
    category: "professional growth",
    body: "Ask families and coordinators for feedback rather than waiting for it. Specific praise tells you what to keep doing, and gentle critique helps you improve.",
  },
  {
    id: "growth-specialise",
    category: "professional growth",
    body: "Consider specialising in an area you enjoy, such as palliative or learning-disability support. Specialists are in steady demand and command better rates.",
  },
  {
    id: "growth-keep-learning",
    category: "professional growth",
    body: "Set aside time for the free training modules in your account. Keeping your knowledge current protects your registration and your clients.",
  },
  {
    id: "growth-shadow-peers",
    category: "professional growth",
    body: "Offer to shadow an experienced colleague on an unfamiliar type of care. Watching a confident peer is one of the quickest ways to build new skills.",
  },

  // ── Self-care ────────────────────────────────────────────────────────
  {
    id: "selfcare-take-breaks",
    category: "self-care",
    body: "Take your full break between back-to-back visits. Hydration and a short sit-down prevent the afternoon dip that increases the risk of mistakes.",
  },
  {
    id: "selfcare-protect-back",
    category: "self-care",
    body: "Protect your back by using the equipment provided and bending at the knees. A single careless lift can cost you weeks of work.",
  },
  {
    id: "selfcare-emotional-load",
    category: "self-care",
    body: "Caring for others is emotionally demanding. Talk to someone you trust after a hard shift rather than carrying it home alone.",
  },
  {
    id: "selfcare-sleep",
    category: "self-care",
    body: "Guard your sleep around early starts and late finishes. Tiredness blunts judgement, and your clients rely on you being alert.",
  },
  {
    id: "selfcare-set-boundaries",
    category: "self-care",
    body: "Set clear boundaries around your availability and stick to them. Saying no to an extra shift when you are exhausted is a professional decision, not a failure.",
  },
  {
    id: "selfcare-eat-well",
    category: "self-care",
    body: "Pack something nourishing for long days on the road. Steady energy keeps you patient and present for every client you see.",
  },

  // ── Platform ─────────────────────────────────────────────────────────
  {
    id: "platform-go-online",
    category: "platform",
    body: "Toggle Go Online when you are free for instant bookings. Auto-match will offer you nearby jobs first while your status is live.",
  },
  {
    id: "platform-complete-profile",
    category: "platform",
    body: "A complete profile with a clear, friendly photo helps families choose you faster. Carers with a photo receive noticeably more booking requests.",
  },
  {
    id: "platform-set-availability",
    category: "platform",
    body: "Keep your weekly availability up to date so the matching system only offers you shifts you can actually take. Accurate availability means fewer wasted invites.",
  },
  {
    id: "platform-travel-radius",
    category: "platform",
    body: "Adjust your travel radius to match how far you are willing to go on the day. A wider radius surfaces more jobs; a tighter one keeps travel manageable.",
  },
  {
    id: "platform-cash-out",
    category: "platform",
    body: "Check your earnings dashboard to see your available balance and cash out when it suits you. Completed shifts settle there automatically.",
  },
  {
    id: "platform-referrals",
    category: "platform",
    body: "Refer a fellow carer from your profile to earn a bonus once they complete their first shift. It is a simple way to grow the team and your income.",
  },
];
