"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "../../_components/ui";

type Me = {
  code: string;
  share_url: string;
  qualifying_bookings_required: number;
  bonus_cents: number;
  bonus_currency: string;
  total_earned_cents: number;
  qualifying_bookings_cap: number;
  referrals: Array<{
    id: string;
    qualifying_bookings: number;
    payout_status: string;
    paid_out_at: string | null;
    created_at: string;
  }>;
};

function fmtMoney(cents: number, currency: string): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  qualified: "bg-emerald-50 text-emerald-800 border-emerald-200",
  paid: "bg-emerald-50 text-emerald-800 border-emerald-200",
  void: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function ReferralsClient() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);
  const [redeemErr, setRedeemErr] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/m/referrals/me", { cache: "no-store" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't load.");
        return;
      }
      const json = (await res.json()) as Me;
      setMe(json);
    } catch {
      setErr("Network error.");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function share() {
    if (!me) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Join SpecialCarer",
          text: `Use my referral code ${me.code} when you sign up as a carer on SpecialCarer.`,
          url: me.share_url,
        });
        return;
      } catch {
        /* user cancelled */
      }
    }
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard?.writeText
    ) {
      await navigator.clipboard.writeText(me.share_url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  }

  async function redeem() {
    setRedeemErr(null);
    setRedeemMsg(null);
    try {
      const res = await fetch("/api/m/referrals/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: redeemCode }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        already_redeemed?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setRedeemErr(prettyError(json.error));
        return;
      }
      setRedeemMsg(
        json.already_redeemed
          ? "You're already linked to a referrer — good news, your bookings still count."
          : "Code redeemed — your referrer earns when you complete 5 bookings.",
      );
      setRedeemCode("");
    } catch {
      setRedeemErr("Network error.");
    }
  }

  if (err) {
    return <p className="px-5 pt-6 text-rose-700 text-sm text-center">{err}</p>;
  }
  if (!me) {
    return (
      <p className="px-5 pt-6 text-subheading text-sm text-center">Loading…</p>
    );
  }

  return (
    <div className="px-5 pt-3 pb-12 space-y-4">
      <Card className="p-5 text-center">
        <p className="text-[12px] uppercase tracking-wide text-subheading">
          Your code
        </p>
        <p className="mt-2 text-[28px] font-extrabold text-heading tracking-widest">
          {me.code}
        </p>
        <p className="mt-2 text-[12px] text-subheading">
          Earn {fmtMoney(me.bonus_cents, me.bonus_currency)} when each
          carer you refer completes their first {me.qualifying_bookings_required}{" "}
          bookings.
        </p>
        <Button block className="mt-4" onClick={share}>
          {shareCopied ? "Link copied!" : "Share invite"}
        </Button>
      </Card>

      <Card className="p-4">
        <p className="text-[12px] uppercase tracking-wide text-subheading">
          Total earned (tracked)
        </p>
        <p className="mt-1 text-[20px] font-extrabold text-heading tabular-nums">
          {fmtMoney(me.total_earned_cents, me.bonus_currency)}
        </p>
        <p className="mt-1 text-[11px] text-subheading">
          Tracked here once each referral qualifies. Payout is processed
          manually for now — you&rsquo;ll get an email.
        </p>
      </Card>

      {me.referrals.length > 0 && (
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-subheading mb-2">
            Your referrals
          </p>
          <ul className="space-y-3">
            {me.referrals.map((r) => {
              const pct = Math.min(
                100,
                Math.round(
                  (r.qualifying_bookings / me.qualifying_bookings_cap) * 100,
                ),
              );
              return (
                <li
                  key={r.id}
                  className="rounded-card border border-line bg-white p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-heading">
                      Joined {new Date(r.created_at).toLocaleDateString("en-GB")}
                    </span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_TONE[r.payout_status] ?? STATUS_TONE.pending}`}
                    >
                      {r.payout_status}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full bg-muted rounded-pill overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-subheading">
                    {r.qualifying_bookings}/{me.qualifying_bookings_cap}{" "}
                    qualifying bookings
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="p-4">
        <p className="text-[14px] font-bold text-heading">Got a code?</p>
        <p className="mt-1 text-[12px] text-subheading">
          Enter your referrer&rsquo;s code so they earn when you complete 5
          bookings.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={redeemCode}
            onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            className="flex-1 px-3 py-2 rounded-xl border border-line text-[14px] tracking-widest"
          />
          <Button onClick={redeem} disabled={redeemCode.length < 4}>
            Redeem
          </Button>
        </div>
        {redeemMsg && (
          <p className="mt-2 text-[12px] text-emerald-700">{redeemMsg}</p>
        )}
        {redeemErr && (
          <p className="mt-2 text-[12px] text-rose-700">{redeemErr}</p>
        )}
      </Card>
    </div>
  );
}

function prettyError(code: string | undefined): string {
  switch (code) {
    case "code_not_found":
      return "We couldn't find that code.";
    case "cannot_self_refer":
      return "That's your own code — nice try!";
    case "invalid_code":
      return "That code looks off. Check the spelling.";
    default:
      return "Couldn't redeem. Please try again.";
  }
}
