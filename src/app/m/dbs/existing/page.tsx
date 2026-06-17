"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TopBar, BottomNav } from "../../_components/ui";
import { isDbsEnabled } from "@/lib/dbs/flag";

export default function ExistingDbsPage() {
  const router = useRouter();
  const [certNumber, setCertNumber] = useState("");
  const [kind, setKind] = useState<"adult" | "child">("adult");
  const [dob, setDob] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isDbsEnabled()) router.replace("/m/home");
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      let res: Response;
      try {
        res = await fetch("/api/m/dbs/self-verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            certificateNumber: certNumber.trim(),
            kind,
            dateOfBirth: dob,
          }),
        });
      } catch {
        setErr(
          "Network error — please check your connection and try again.",
        );
        return;
      }
      let body: { ok?: boolean; error?: string } = {};
      try {
        body = await res.json();
      } catch {
        // Non-JSON response from server (e.g. proxy/HTML error page).
        body = {};
      }
      if (!res.ok) {
        setErr(body.error ?? "Could not verify this certificate.");
        return;
      }
      setDone(true);
      setTimeout(() => router.replace("/m/dbs"), 1200);
    } finally {
      setBusy(false);
    }
  }

  if (!isDbsEnabled()) return null;

  return (
    <div className="min-h-screen bg-bg-screen sc-with-bottom-nav">
      <TopBar title="I already have a DBS" />

      <div className="px-5 pt-3 space-y-4">
        <div className="rounded-card bg-white p-4 shadow-card">
          <p className="text-[13px] text-subheading">
            If you already hold an Enhanced DBS that&apos;s registered on the{" "}
            <span className="font-medium text-heading">DBS Update Service</span>,
            we can verify it online — no new check and no £60 cost. Enter your
            certificate details below.
          </p>
        </div>

        {done ? (
          <div className="rounded-card bg-white p-4 shadow-card">
            <p className="text-[14px] font-medium text-heading">
              Verified — your DBS has been added. Taking you back…
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="rounded-card bg-white p-4 shadow-card space-y-4">
            {err && (
              <div className="rounded-lg bg-rose-50 p-3 text-[13px] text-rose-700">
                {err}
              </div>
            )}

            <label className="block text-[13px]">
              <span className="mb-1 block font-medium text-heading">
                Certificate number
              </span>
              <input
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                inputMode="numeric"
                placeholder="12-digit DBS certificate number"
                className="w-full rounded-lg border border-line px-3 py-2"
              />
            </label>

            <label className="block text-[13px]">
              <span className="mb-1 block font-medium text-heading">Workforce</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as "adult" | "child")}
                className="w-full rounded-lg border border-line px-3 py-2"
              >
                <option value="adult">Adult</option>
                <option value="child">Child</option>
              </select>
            </label>

            <label className="block text-[13px]">
              <span className="mb-1 block font-medium text-heading">
                Date of birth
              </span>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full rounded-lg border border-line px-3 py-2"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 items-center rounded-pill bg-primary px-5 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify my DBS"}
            </button>
          </form>
        )}
      </div>

      <BottomNav active="profile" role="carer" />
    </div>
  );
}
