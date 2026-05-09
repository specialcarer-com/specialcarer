"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import RegShell from "../_components/RegShell";
import { Button, Input } from "../../../_components/ui";

type Tab = "msa" | "dpa";

export default function ContractsClient({
  orgLegalName,
  bookerName,
  bookerJobTitle,
  msaVersion,
  dpaVersion,
  msaMarkdown,
  dpaMarkdown,
}: {
  orgLegalName: string;
  bookerName: string;
  bookerJobTitle: string;
  msaVersion: string;
  dpaVersion: string;
  msaMarkdown: string;
  dpaMarkdown: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("msa");
  const [scrolled, setScrolled] = useState<{ msa: boolean; dpa: boolean }>({
    msa: false,
    dpa: false,
  });
  const [name, setName] = useState(bookerName);
  const [role, setRole] = useState(bookerJobTitle);
  const [confirmAuthorised, setConfirmAuthorised] = useState(false);
  const [confirmRead, setConfirmRead] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const msaRef = useRef<HTMLDivElement | null>(null);
  const dpaRef = useRef<HTMLDivElement | null>(null);

  // Mark a tab as scrolled-to-bottom when its scroll handler reports
  // ≤8px from the bottom. Once both have been read, the inputs unlock.
  useEffect(() => {
    function handler(which: Tab, el: HTMLDivElement | null) {
      if (!el) return () => undefined;
      const onScroll = () => {
        const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (remaining <= 8) {
          setScrolled((p) => (p[which] ? p : { ...p, [which]: true }));
        }
      };
      el.addEventListener("scroll", onScroll);
      // Edge case: panel already shorter than the viewport.
      if (el.scrollHeight - el.clientHeight <= 8) {
        setScrolled((p) => (p[which] ? p : { ...p, [which]: true }));
      }
      return () => el.removeEventListener("scroll", onScroll);
    }
    const off1 = handler("msa", msaRef.current);
    const off2 = handler("dpa", dpaRef.current);
    return () => {
      off1?.();
      off2?.();
    };
  }, [tab]);

  const allReady = useMemo(
    () =>
      scrolled.msa &&
      scrolled.dpa &&
      confirmAuthorised &&
      confirmRead &&
      name.trim().length >= 2 &&
      role.trim().length >= 2,
    [scrolled, confirmAuthorised, confirmRead, name, role],
  );

  async function submit() {
    if (!allReady) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/m/org/register/sign-contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_versions: { msa: msaVersion, dpa: dpaVersion },
          signed_by_name: name.trim(),
          signed_by_role: role.trim(),
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't sign.");
        return;
      }
      router.push("/m/org/register/step-8");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RegShell
      step={8}
      title="Sign our agreements"
      subtitle="Master Services Agreement + Data Processing Addendum. Scroll to the end of each tab to unlock signing."
      back="/m/org/register/step-7"
    >
      <div className="rounded-pill bg-muted p-1 grid grid-cols-2 gap-1 mb-3">
        {(["msa", "dpa"] as const).map((t) => {
          const on = tab === t;
          const done = scrolled[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`h-9 rounded-pill text-[12px] font-semibold transition ${
                on ? "bg-white text-heading shadow-sm" : "text-subheading"
              }`}
            >
              {t === "msa" ? "MSA" : "DPA"}
              {done ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      <div
        ref={tab === "msa" ? msaRef : dpaRef}
        className="rounded-card border border-line bg-white p-4 overflow-y-auto prose prose-sm max-w-none"
        style={{ height: "55vh", minHeight: 360 }}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {tab === "msa" ? msaMarkdown : dpaMarkdown}
        </ReactMarkdown>
      </div>
      <p className="mt-2 text-[11px] text-subheading">
        Version on file: {tab === "msa" ? msaVersion : dpaVersion}.
        {" "}
        {scrolled[tab]
          ? "Marked as read."
          : "Scroll to the bottom to mark this as read."}
      </p>

      <div className="mt-5 space-y-3">
        <Input
          label="Your full name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Your job title *"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
        <label className="flex items-start gap-2 text-[13px] text-heading">
          <input
            type="checkbox"
            checked={confirmAuthorised}
            onChange={(e) => setConfirmAuthorised(e.target.checked)}
            className="mt-1"
          />
          <span>
            I confirm I am authorised to bind <strong>{orgLegalName}</strong>.
          </span>
        </label>
        <label className="flex items-start gap-2 text-[13px] text-heading">
          <input
            type="checkbox"
            checked={confirmRead}
            onChange={(e) => setConfirmRead(e.target.checked)}
            className="mt-1"
          />
          <span>
            I have read and agree to the Master Services Agreement and the
            Data Processing Addendum.
          </span>
        </label>

        <label className="block">
          <span className="text-[13px] font-semibold text-heading">
            Any comments or feedback for our legal team? (optional)
          </span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 4000))}
            rows={3}
            placeholder="e.g. We'd like to discuss the liability cap before our next renewal."
            className="mt-1 w-full rounded-xl border border-line p-3 text-[14px]"
          />
        </label>
      </div>

      {err && <p className="mt-3 text-[12px] text-rose-700">{err}</p>}
      <div className="mt-5">
        <Button block disabled={!allReady || busy} onClick={submit}>
          {busy ? "Signing…" : "Sign and continue"}
        </Button>
        {!allReady && (
          <p className="mt-2 text-center text-[11px] text-subheading">
            Read both documents and complete the signature fields to continue.
          </p>
        )}
      </div>
    </RegShell>
  );
}
