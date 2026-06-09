"use client";

/**
 * Gap 4: header chip + picker for the viewer's in-chat translation
 * language. Shows the current preference ("🇪🇸 Spanish" / "Translate ·
 * Off"); tapping opens a sheet to pick one of the nine supported
 * languages or turn translation off. The choice is persisted to
 * profiles.chat_translate_to via /api/m/me/chat-translate-pref and lifted
 * to the parent so the message list can react immediately.
 */
import { useState } from "react";
import { CHAT_LANGUAGES, languageByCode } from "@/lib/chat/languages";

const TEAL = "#039EA0";

type Props = {
  value: string | null;
  onChange: (lang: string | null) => void;
};

export function TranslateToggle({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = languageByCode(value);

  async function pick(lang: string | null) {
    setBusy(true);
    const prev = value;
    onChange(lang); // optimistic
    try {
      const res = await fetch("/api/m/me/chat-translate-pref", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      onChange(prev); // revert
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Translation language"
        className="font-display flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition"
        style={
          active
            ? { backgroundColor: TEAL, color: "#FFFFFF" }
            : {
                backgroundColor: "transparent",
                color: "#0F1416",
                border: "1px solid rgba(3, 158, 160, 0.3)",
              }
        }
      >
        <span aria-hidden="true">{active ? active.flag : "🌐"}</span>
        <span>{active ? active.label : "Translate · Off"}</span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white p-4 sc-safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-display mb-3 text-[15px] font-semibold text-heading">
              Translate incoming messages to
            </p>
            <ul className="flex flex-col gap-1">
              {CHAT_LANGUAGES.map((l) => {
                const selected = l.code === value;
                return (
                  <li key={l.code}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => pick(l.code)}
                      className="font-display flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] transition disabled:opacity-50"
                      style={
                        selected
                          ? { backgroundColor: "rgba(3, 158, 160, 0.1)", color: TEAL }
                          : { color: "#0F1416" }
                      }
                    >
                      <span aria-hidden="true" className="text-[18px]">
                        {l.flag}
                      </span>
                      <span className="flex-1">{l.label}</span>
                      {selected ? <span aria-hidden="true">✓</span> : null}
                    </button>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => pick(null)}
                  className="font-display flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-subheading transition disabled:opacity-50"
                  style={value === null ? { color: TEAL } : undefined}
                >
                  <span aria-hidden="true" className="text-[18px]">
                    🚫
                  </span>
                  <span className="flex-1">Off (show original)</span>
                  {value === null ? <span aria-hidden="true">✓</span> : null}
                </button>
              </li>
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
