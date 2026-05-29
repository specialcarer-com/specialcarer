"use client";

/**
 * P1-B11: bottom sheet for the seeker to invite a family member to a
 * chat thread by email. Submits to POST /api/m/chat/threads/[id]/participants
 * (the parent can override `onSubmit` for tests / mock mode).
 */
import { useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  threadId: string | null;
  onSubmit?: (
    threadId: string,
    email: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onSent?: (email: string) => void;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function defaultSubmit(
  threadId: string,
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(
    `/api/m/chat/threads/${encodeURIComponent(threadId)}/participants`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role: "family" }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? "invite_failed" };
  }
  return { ok: true };
}

export function InviteFamilySheet({
  open,
  onClose,
  threadId,
  onSubmit = defaultSubmit,
  onSent,
}: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!threadId) {
      setError("This conversation isn't ready yet.");
      return;
    }
    setSubmitting(true);
    const out = await onSubmit(threadId, trimmed);
    setSubmitting(false);
    if (!out.ok) {
      setError(out.error ?? "Could not send invite.");
      return;
    }
    onSent?.(trimmed);
    setEmail("");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Invite family member"
    >
      <div
        className="w-full rounded-t-2xl bg-white p-5 sc-safe-bottom"
        onClick={(e) => e.stopPropagation()}
        style={{
          fontFamily:
            "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        <h2 className="font-display text-[17px] font-bold text-heading">
          Invite a family member
        </h2>
        <p className="mt-2 text-[13px] leading-snug text-subheading">
          They&apos;ll get an email with a link to join this chat. They can see
          all messages, but can&apos;t trigger SOS, edit tasks, or pay.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <label className="font-display text-[12px] font-semibold text-heading">
            Email address
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="mt-1 h-11 w-full rounded-xl bg-muted px-4 text-[15px] text-heading placeholder:text-subheading focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
          </label>
          {error ? (
            <p className="text-[13px]" style={{ color: "#A22" }}>
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="h-11 rounded-full font-display text-[14.5px] font-semibold text-white shadow-card disabled:opacity-60"
            style={{ background: "#039EA0" }}
          >
            {submitting ? "Sending…" : "Send invite"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-full bg-muted font-display text-[14.5px] font-semibold text-heading"
          >
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
}
