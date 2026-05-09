"use client";

import { useEffect, useState } from "react";
import { TopBar, Button, Input } from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";

type RateRow = {
  hourly_rate_cents: number | null;
  weekly_rate_cents: number | null;
  currency: string | null;
};

function symbolFor(currency: string | null): "£" | "$" {
  return currency?.toUpperCase() === "USD" ? "$" : "£";
}

function centsToInputValue(cents: number | null): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  // Show in major units. Allow decimals for currencies that have them.
  return (cents / 100).toFixed(2);
}

function parseToCents(input: string): number | null {
  if (!input.trim()) return null;
  const n = Number(input.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export default function RatesPage() {
  const supabase = createClient();
  const [hourly, setHourly] = useState<string>("");
  const [weekly, setWeekly] = useState<string>("");
  const [currency, setCurrency] = useState<string>("GBP");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setLoaded(true);
        setErr("Sign in to manage your rates.");
        return;
      }
      setUserId(user.id);
      const { data, error } = await supabase
        .from("caregiver_profiles")
        .select("hourly_rate_cents, weekly_rate_cents, currency")
        .eq("user_id", user.id)
        .maybeSingle<RateRow>();
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        setLoaded(true);
        return;
      }
      if (data) {
        setHourly(centsToInputValue(data.hourly_rate_cents));
        setWeekly(centsToInputValue(data.weekly_rate_cents));
        setCurrency(data.currency ?? "GBP");
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!userId) return;
    setBusy(true);
    setErr(null);
    setSavedAt(null);
    try {
      const hourlyCents = parseToCents(hourly);
      if (hourly.trim() && hourlyCents == null) {
        setErr("Enter a valid hourly rate.");
        return;
      }
      const weeklyCents = parseToCents(weekly);
      if (weekly.trim() && weeklyCents == null) {
        setErr("Enter a valid weekly rate.");
        return;
      }
      const update: Record<string, unknown> = {
        hourly_rate_cents: hourlyCents,
        weekly_rate_cents: weeklyCents,
      };
      const { error } = await supabase
        .from("caregiver_profiles")
        .update(update)
        .eq("user_id", userId);
      if (error) {
        setErr(error.message);
        return;
      }
      setSavedAt(Date.now());
    } finally {
      setBusy(false);
    }
  }

  const sym = symbolFor(currency);

  return (
    <div className="min-h-screen bg-bg-screen pb-12">
      <TopBar title="Hourly rate" back="/m/profile" />

      <div className="px-5 pt-3 space-y-4">
        {!loaded && (
          <p className="text-center text-sm text-subheading">Loading…</p>
        )}
        {loaded && (
          <>
            <div className="rounded-card bg-white p-4 shadow-card">
              <p className="text-[12px] uppercase tracking-wide text-subheading">
                Currency
              </p>
              <p className="mt-1 text-[14px] text-heading">
                {currency} ({sym})
              </p>
              <p className="mt-1 text-[11px] text-subheading">
                Currency is set on your profile and matches your country.
              </p>
            </div>

            <div className="rounded-card bg-white p-4 shadow-card space-y-3">
              <Input
                label={`Hourly rate (${sym}/hr)`}
                value={hourly}
                onChange={(e) => setHourly(e.target.value)}
                inputMode="decimal"
                placeholder={`e.g. ${sym}18`}
              />
              <Input
                label={`Weekly rate (${sym}/wk, optional)`}
                value={weekly}
                onChange={(e) => setWeekly(e.target.value)}
                inputMode="decimal"
                placeholder={`e.g. ${sym}750`}
                hint="Used for live-in care quotes."
              />
              {err && (
                <p className="text-[12px] text-rose-700">{err}</p>
              )}
              {savedAt && (
                <p className="text-[12px] text-emerald-700">
                  Saved {new Date(savedAt).toLocaleTimeString()}
                </p>
              )}
              <Button block onClick={save} disabled={busy || !userId}>
                {busy ? "Saving…" : "Save rates"}
              </Button>
            </div>

            <div className="rounded-card border border-line bg-muted/40 p-4">
              <p className="text-[12px] uppercase tracking-wide text-subheading">
                Sleep-in pay
              </p>
              <p className="mt-1 text-[13.5px] text-heading">
                All Care 4 U Group pays you a fixed{" "}
                <strong>{sym}50 per sleep-in duty</strong> for organisation
                bookings. Your hourly rate above applies to all other
                bookings.
              </p>
              <p className="mt-2 text-[11px] text-subheading">
                Sleep-in pay is set by the company and isn&rsquo;t editable.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
