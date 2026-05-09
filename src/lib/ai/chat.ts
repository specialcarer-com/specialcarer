import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type ChatIntent,
  type ChatIntentId,
  type ChatSurface,
} from "./types";

/**
 * Heuristic chat triage v1. No LLM. Keyword-scored intents + a static
 * suggested-reply table. Escalation routes through the existing
 * support_tickets table (priority is intent-driven).
 */

export const INTENTS: Record<ChatIntentId, ChatIntent> = {
  booking_status: {
    id: "booking_status",
    label: "Booking status",
    keywords: [
      "where is my carer",
      "is my booking confirmed",
      "booking status",
      "when is",
      "eta",
      "running late",
      "tracking",
    ],
    suggestedReply:
      "You can see live status on your booking page. Tap the booking from your dashboard, then look for the live tracking section.",
    escalate: false,
  },
  change_or_cancel: {
    id: "change_or_cancel",
    label: "Change or cancel",
    keywords: [
      "cancel",
      "reschedule",
      "change time",
      "change date",
      "move my booking",
      "edit booking",
    ],
    suggestedReply:
      "You can cancel or reschedule from the booking page (look for the manage menu). Cancellations within 24 hours of the start time may incur a fee — see our cancellation policy.",
    escalate: false,
  },
  payment_issue: {
    id: "payment_issue",
    label: "Payment issue",
    keywords: [
      "payment failed",
      "charge",
      "billing",
      "card declined",
      "double charged",
      "invoice",
    ],
    suggestedReply:
      "Sorry to hear that. Most payment issues resolve when you re-enter the card. If a charge looks wrong, give us the booking reference and we'll dig in.",
    escalate: false,
  },
  refund_request: {
    id: "refund_request",
    label: "Refund request",
    keywords: ["refund", "money back", "want my money back", "chargeback"],
    suggestedReply:
      "We process refunds case-by-case. Please share the booking reference and a short description of what went wrong; a human will review within 1 business day.",
    escalate: false,
  },
  missing_caregiver: {
    id: "missing_caregiver",
    label: "Missing caregiver",
    keywords: [
      "carer didn't show",
      "carer didn't show up",
      "no-show",
      "no show",
      "carer not here",
      "where is the carer",
      "no one came",
      "nobody came",
    ],
    suggestedReply:
      "I'm flagging this to a human now. While you wait — if anyone is in immediate danger, dial 999 (UK) or 911 (US).",
    escalate: true,
  },
  safety_concern: {
    id: "safety_concern",
    label: "Safety concern",
    keywords: [
      "unsafe",
      "abuse",
      "abusive",
      "scared",
      "threat",
      "harassment",
      "hurt",
      "injured",
      "emergency",
    ],
    suggestedReply:
      "I'm escalating this immediately to our trust & safety team. If anyone is in immediate danger, dial 999 (UK) or 911 (US) first.",
    escalate: true,
  },
  how_to_use: {
    id: "how_to_use",
    label: "How to use SpecialCarer",
    keywords: [
      "how do i book",
      "how to book",
      "how does this work",
      "getting started",
      "first booking",
      "how to use",
    ],
    suggestedReply:
      "Welcome! To book, search by city or postcode, pick a vetted carer, and confirm the time. Payment is held in escrow until the shift completes.",
    escalate: false,
  },
  become_a_caregiver: {
    id: "become_a_caregiver",
    label: "Become a caregiver",
    keywords: [
      "become a carer",
      "become a caregiver",
      "i want to work",
      "join as a carer",
      "apply as a carer",
      "carer application",
    ],
    suggestedReply:
      "We're always recruiting carers — visit /become-a-caregiver to start the application. Vetting includes ID, references, background check, and a short interview.",
    escalate: false,
  },
  talk_to_human: {
    id: "talk_to_human",
    label: "Talk to a human",
    keywords: [
      "talk to a human",
      "speak to a person",
      "real person",
      "human please",
      "agent please",
      "live agent",
    ],
    suggestedReply:
      "Connecting you with a human now. They'll pick up the conversation in this thread.",
    escalate: true,
  },
  unknown: {
    id: "unknown",
    label: "Unknown",
    keywords: [],
    suggestedReply:
      "I'm not sure I caught that. I'll loop in a human so they can help.",
    escalate: true,
  },
};

const MIN_CONFIDENCE = 0.3;

/**
 * Classify a freeform message. Lower-cases, scans for keyword
 * substring hits, returns the highest-scoring intent. Below the floor,
 * returns `unknown` (which escalates).
 */
export function classifyMessage(body: string): {
  intentId: ChatIntentId;
  confidence: number;
} {
  const text = (body ?? "").toLowerCase();
  if (!text.trim()) {
    return { intentId: "unknown", confidence: 0 };
  }

  let bestId: ChatIntentId = "unknown";
  let bestScore = 0;
  for (const intent of Object.values(INTENTS)) {
    if (intent.id === "unknown") continue;
    let hits = 0;
    let denom = 0;
    for (const kw of intent.keywords) {
      denom += 1;
      if (text.includes(kw)) hits += 1;
    }
    if (denom === 0) continue;
    // Score = hit rate, slightly boosted if more than one keyword
    // matched. Bounded 0..1.
    const baseRate = hits / denom;
    const score = Math.min(1, baseRate + (hits > 1 ? 0.2 : 0));
    if (score > bestScore) {
      bestScore = score;
      bestId = intent.id;
    }
  }

  if (bestScore < MIN_CONFIDENCE) {
    return { intentId: "unknown", confidence: bestScore };
  }
  return { intentId: bestId, confidence: bestScore };
}

// ── Sessions ──────────────────────────────────────────────────────

type CreateSessionInput = {
  userId?: string | null;
  anonSessionId?: string | null;
  surface: ChatSurface;
};

/**
 * Create a chat session, or reuse the most recent open session for the
 * same userId on the same surface (so refreshing the widget doesn't
 * spawn a new session every time).
 */
export async function createSession(input: CreateSessionInput): Promise<{
  id: string;
  reused: boolean;
}> {
  const admin = createAdminClient();

  if (input.userId) {
    const { data: existing } = await admin
      .from("ai_chat_sessions")
      .select("id")
      .eq("user_id", input.userId)
      .eq("surface", input.surface)
      .eq("outcome", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (existing) {
      return { id: existing.id, reused: true };
    }
  }

  const { data: created, error } = await admin
    .from("ai_chat_sessions")
    .insert({
      user_id: input.userId ?? null,
      anon_session_id: input.anonSessionId ?? null,
      surface: input.surface,
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(error?.message ?? "create_session_failed");
  }
  return { id: created.id as string, reused: false };
}

// ── Incoming message ──────────────────────────────────────────────

type HandleInput = {
  sessionId: string;
  userId: string | null;
  body: string;
  surface: ChatSurface;
};

type HandleResult = {
  reply: string;
  intent: ChatIntentId;
  confidence: number;
  escalated: boolean;
  ticketId: string | null;
};

/**
 * Handle a user message: persist it, classify, write a bot reply (or
 * a system "human is on the way" line on escalate), update the
 * session's intent + confidence, and create a support_tickets row on
 * escalate.
 */
export async function handleIncomingMessage(
  input: HandleInput,
): Promise<HandleResult> {
  const admin = createAdminClient();

  // 1) Persist the user message.
  await admin.from("ai_chat_messages").insert({
    session_id: input.sessionId,
    role: "user",
    body: input.body,
  });

  // 2) Classify.
  const { intentId, confidence } = classifyMessage(input.body);
  const intent = INTENTS[intentId];

  // 3) Persist a bot reply.
  await admin.from("ai_chat_messages").insert({
    session_id: input.sessionId,
    role: "bot",
    body: intent.suggestedReply,
    meta: { intent: intentId, confidence, escalated: intent.escalate },
  });

  // 4) Update session state.
  const sessionPatch: Record<string, unknown> = {
    intent: intentId,
    last_intent_confidence: confidence,
  };

  let ticketId: string | null = null;
  if (intent.escalate) {
    sessionPatch.outcome = "escalated";

    // Persist a system line, since this is the user-visible signal
    // that they're now being passed to a human.
    await admin.from("ai_chat_messages").insert({
      session_id: input.sessionId,
      role: "system",
      body: "We've connected you to a human.",
      meta: { intent: intentId, escalated: true },
    });

    // Create a support_tickets row (best-effort) tied to user_id.
    if (input.userId) {
      const subject = (input.body ?? "").trim().slice(0, 80) || intent.label;
      const priority =
        intentId === "safety_concern" || intentId === "missing_caregiver"
          ? "urgent"
          : "normal";
      const { data: ticket } = await admin
        .from("support_tickets")
        .insert({
          subject,
          status: "open",
          priority,
          user_id: input.userId,
          channel: "app",
          tags: ["ai_chat", intentId],
        })
        .select("id")
        .single();
      if (ticket) {
        ticketId = ticket.id as string;
        sessionPatch.ticket_id = ticketId;
      }
    }
  } else if (
    confidence >= 0.6 &&
    !["unknown", "talk_to_human"].includes(intentId)
  ) {
    // Confident self-serve answer — mark as bot-resolved (the user
    // can keep typing to continue the session).
    sessionPatch.outcome = "bot_resolved";
  }

  await admin
    .from("ai_chat_sessions")
    .update(sessionPatch)
    .eq("id", input.sessionId);

  return {
    reply: intent.suggestedReply,
    intent: intentId,
    confidence,
    escalated: intent.escalate,
    ticketId,
  };
}
