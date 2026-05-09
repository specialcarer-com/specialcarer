/**
 * voiceParser — tiny pattern-based intent parser for voice booking.
 * No external NLP dependencies. Handles the three intents required by
 * the Accessibility v1 spec.
 */

export type ParsedTime = {
  day: string; // e.g. "today", "+1" (tomorrow), "+2", a weekday name, or ISO date
  time: string; // HH:MM 24-hour
};

export type VoiceIntent =
  | { intent: "book"; carer: string; when: ParsedTime | null }
  | { intent: "search"; city: string }
  | { intent: "navigate"; target: string };

// ─── helpers ──────────────────────────────────────────────────────────────

const WEEKDAYS: Record<string, string> = {
  monday: "monday",
  mon: "monday",
  tuesday: "tuesday",
  tue: "tuesday",
  wednesday: "wednesday",
  wed: "wednesday",
  thursday: "thursday",
  thu: "thursday",
  friday: "friday",
  fri: "friday",
  saturday: "saturday",
  sat: "saturday",
  sunday: "sunday",
  sun: "sunday",
};

/**
 * Normalise a time expression to HH:MM (24-hour).
 * Handles: "3pm", "3 pm", "15:00", "3:30pm", "noon", "midnight".
 */
function parseTime(raw: string): string | null {
  const s = raw.trim().toLowerCase();

  if (s === "noon") return "12:00";
  if (s === "midnight") return "00:00";

  // "15:00" or "3:30"
  const colonMatch = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
  if (colonMatch) {
    let h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    const ampm = colonMatch[3];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // "3pm" / "3 pm"
  const simpleMatch = s.match(/^(\d{1,2})\s*(am|pm)$/);
  if (simpleMatch) {
    let h = parseInt(simpleMatch[1], 10);
    const ampm = simpleMatch[2];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:00`;
  }

  return null;
}

/**
 * Normalise a day expression.
 * "today" → "today"
 * "tomorrow" → "+1"
 * "monday" → "monday"
 * "next monday" → "next-monday"
 */
function parseDay(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === "today") return "today";
  if (s === "tomorrow" || s === "tmrw" || s === "tmr") return "+1";
  if (s === "day after tomorrow") return "+2";
  if (s.startsWith("next ")) {
    const d = s.slice(5);
    if (WEEKDAYS[d]) return `next-${WEEKDAYS[d]}`;
  }
  if (WEEKDAYS[s]) return WEEKDAYS[s];
  return s;
}

/**
 * Try to extract a "when" clause that contains a day and/or time.
 * e.g. "tomorrow 3pm", "friday at 10am", "today at noon"
 */
function parseWhen(raw: string): ParsedTime | null {
  const s = raw.trim().toLowerCase();

  // Match "tomorrow 3pm", "today at 15:00", "friday 10am", "next monday at noon"
  const pattern =
    /^(today|tomorrow|tmrw?|day after tomorrow|(?:next\s+)?(?:monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun))[\s,]+(?:at\s+)?(.+)$/i;
  const m = s.match(pattern);
  if (m) {
    const day = parseDay(m[1]);
    const time = parseTime(m[2]);
    if (time) return { day, time };
  }

  // Time only, no day → default to today
  const timeOnly = parseTime(s);
  if (timeOnly) return { day: "today", time: timeOnly };

  // Day only, no time → default to 09:00
  const dayOnly = /(today|tomorrow|tmrw?|day after tomorrow|(?:next\s+)?(?:monday|tue?s?day?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?))/i.exec(s);
  if (dayOnly) return { day: parseDay(dayOnly[1]), time: "09:00" };

  return null;
}

// ─── main parser ──────────────────────────────────────────────────────────

/**
 * Parse a voice transcript into a structured intent.
 * Returns null if no pattern matches.
 */
export function parseVoiceIntent(transcript: string): VoiceIntent | null {
  const text = transcript.trim().toLowerCase();

  // ── "show my bookings" ───────────────────────────────────────────────────
  if (
    /(?:show|open|go to|view)[\s\w]*(?:my\s+)?bookings?/.test(text) ||
    /(?:take me to|navigate to|open)[\s\w]*bookings?/.test(text)
  ) {
    return { intent: "navigate", target: "/m/bookings" };
  }

  // ── "book {name} for {when}" ─────────────────────────────────────────────
  // e.g. "book sarah for tomorrow 3pm"
  //      "book nurse john for friday at 10am"
  //      "book mary"
  const bookMatch = text.match(
    /^(?:book|hire|schedule|get)\s+(?:a\s+carer\s+)?(.+?)(?:\s+for\s+(.+))?$/,
  );
  if (bookMatch) {
    const carerRaw = bookMatch[1].trim();
    const whenRaw = bookMatch[2]?.trim() ?? null;
    // Filter out obvious non-name fragments that look like service types
    const serviceKeywords = ["childcare", "elderly", "postnatal", "complex", "special needs", "carer", "nurse"];
    const isCarer = !serviceKeywords.some((k) => carerRaw === k);
    if (isCarer && carerRaw.length >= 2) {
      return {
        intent: "book",
        carer: carerRaw,
        when: whenRaw ? parseWhen(whenRaw) : null,
      };
    }
  }

  // ── "find a carer in {city}" ──────────────────────────────────────────────
  const searchMatch = text.match(
    /(?:find|search|look(?:\s+for)?|show)[\s\w]*(?:carer|caregiver|nurse|help|someone)(?:\s+in\s+|\s+near\s+|\s+around\s+)(.+)/,
  );
  if (searchMatch) {
    return { intent: "search", city: searchMatch[1].trim() };
  }

  // ── "carers in {city}" shorthand ─────────────────────────────────────────
  const cityMatch = text.match(/(?:carers?|caregivers?|nurses?)\s+(?:in|near|around)\s+(.+)/);
  if (cityMatch) {
    return { intent: "search", city: cityMatch[1].trim() };
  }

  return null;
}
