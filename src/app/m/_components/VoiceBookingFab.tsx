"use client";

/**
 * VoiceBookingFab — floating mic button for voice-driven booking.
 *
 * Shown on /m/post-job, /m/home, /m/search when voiceEnabled is true.
 * Uses the Web Speech API (SpeechRecognition / webkitSpeechRecognition).
 * On iOS WebView where the API is absent, shows a friendly toast.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccessibility } from "@/lib/i18n/LocaleContext";
import { parseVoiceIntent } from "@/lib/ai/voiceParser";

// ─── types ─────────────────────────────────────────────────────────────────
type State = "idle" | "listening" | "processing" | "error";

// SpeechRecognition is not in TS lib by default — declare minimally.
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  readonly isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

// ─── helpers ───────────────────────────────────────────────────────────────
function getSpeechRecognition(): (new () => ISpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor =
    (w["SpeechRecognition"] as (new () => ISpeechRecognition) | undefined) ??
    (w["webkitSpeechRecognition"] as (new () => ISpeechRecognition) | undefined) ??
    null;
  return Ctor;
}

// ─── toast ─────────────────────────────────────────────────────────────────
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9999] bg-[#0F1416] text-white text-[13px] font-medium px-4 py-2.5 rounded-pill shadow-lg max-w-[320px] text-center"
    >
      {message}
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────
export default function VoiceBookingFab() {
  const router = useRouter();
  const { voiceEnabled, t, locale } = useAccessibility();
  const [state, setState] = useState<State>("idle");
  const [toast, setToast] = useState<string | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  const handleResult = useCallback(
    (transcript: string) => {
      setState("processing");
      const intent = parseVoiceIntent(transcript);

      if (!intent) {
        showToast(t("voice.didntCatch"));
        setState("idle");
        return;
      }

      if (intent.intent === "navigate") {
        router.push(intent.target);
      } else if (intent.intent === "search") {
        const q = encodeURIComponent(intent.city);
        router.push(`/m/search?q=${q}`);
      } else if (intent.intent === "book") {
        const params = new URLSearchParams();
        if (intent.carer) params.set("carer", intent.carer);
        if (intent.when) {
          params.set("day", intent.when.day);
          params.set("time", intent.when.time);
        }
        router.push(`/m/post-job?prefill=${encodeURIComponent(params.toString())}`);
      }

      setState("idle");
    },
    [router, showToast, t],
  );

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      showToast("Voice not supported on this device");
      return;
    }

    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = locale;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      if (transcript) handleResult(transcript);
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "not-allowed") {
        showToast(t("voice.micPermission"));
      } else {
        showToast(t("voice.didntCatch"));
      }
      setState("idle");
    };

    rec.onend = () => {
      setState((s) => (s === "listening" ? "idle" : s));
    };

    recognitionRef.current = rec;
    rec.start();
    setState("listening");
  }, [handleResult, locale, showToast, t]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setState("idle");
  }, []);

  // Abort on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  if (!voiceEnabled) return null;

  const isListening = state === "listening";
  const label = isListening ? t("voice.listening") : t("voice.idle");

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <button
        type="button"
        aria-label={label}
        aria-pressed={isListening}
        onClick={isListening ? stopListening : startListening}
        className={[
          "fixed right-4 bottom-24 z-[9998]",
          "h-14 w-14 rounded-full shadow-lg",
          "grid place-items-center transition",
          "sc-no-select",
          isListening
            ? "bg-[#E33] text-white sc-pulse"
            : "bg-[#039EA0] text-white active:bg-[#027a7c]",
        ].join(" ")}
      >
        <IconMic active={isListening} />
        <span className="sr-only">{label}</span>
      </button>
    </>
  );
}

// ─── mic icon ──────────────────────────────────────────────────────────────
function IconMic({ active }: { active: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.5 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0014 0" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}
