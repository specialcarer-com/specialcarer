"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ButtonDef = {
  key: string;
  label: string;
  status: string;
  action?: string;
  tone: "primary" | "warn" | "danger" | "muted";
};

const BUTTONS: ButtonDef[] = [
  { key: "no_action", label: "Dismiss", status: "resolved_no_action", tone: "muted" },
  { key: "warn", label: "Warn sender", status: "resolved_warn", action: "warn_sender", tone: "warn" },
  { key: "mute", label: "Mute 24h", status: "resolved_warn", action: "mute_sender_24h", tone: "warn" },
  { key: "ban", label: "Ban sender", status: "resolved_ban", action: "ban_sender", tone: "danger" },
  {
    key: "safeguarding",
    label: "Mark safeguarding",
    status: "resolved_safeguarding",
    action: "mark_safeguarding",
    tone: "primary",
  },
];

const TONE_STYLE: Record<ButtonDef["tone"], React.CSSProperties> = {
  primary: { background: "#039EA0", color: "white" },
  warn: { background: "#F4A261", color: "#0F1416" },
  danger: { background: "#C44A4A", color: "white" },
  muted: { background: "white", color: "#0F1416", borderColor: "#E5E0D5", borderWidth: 1 },
};

export default function FlagRowActions({ flagId }: { flagId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(btn: ButtonDef) {
    setBusy(btn.key);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/chat/flags/${flagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: btn.status, action: btn.action }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Action failed.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="mt-4 flex flex-wrap gap-2"
      style={{ fontFamily: "var(--font-jakarta), 'Plus Jakarta Sans', sans-serif" }}
    >
      {BUTTONS.map((btn) => (
        <button
          key={btn.key}
          type="button"
          onClick={() => void act(btn)}
          disabled={busy !== null}
          className="rounded-md px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          style={{ ...TONE_STYLE[btn.tone], borderStyle: btn.tone === "muted" ? "solid" : undefined }}
        >
          {busy === btn.key ? "…" : btn.label}
        </button>
      ))}
      {err && (
        <p role="status" className="w-full text-[12px]" style={{ color: "#C22" }}>
          {err}
        </p>
      )}
    </div>
  );
}
