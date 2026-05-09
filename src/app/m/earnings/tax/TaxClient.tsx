"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "../../_components/ui";

type Country = "GB" | "US";

const TAX_LINK: Record<Country, { label: string; href: string }> = {
  GB: {
    label: "gov.uk: self-employed tax",
    href: "https://www.gov.uk/working-for-yourself",
  },
  US: {
    label: "IRS Schedule C — sole proprietor",
    href: "https://www.irs.gov/forms-pubs/about-schedule-c-form-1040",
  },
};

const NOW = new Date().getUTCFullYear();
const YEARS = [NOW, NOW - 1, NOW - 2];

export default function TaxClient() {
  const [country, setCountry] = useState<Country>("GB");
  const [year, setYear] = useState<number>(NOW);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Best-effort country auto-detect from the summary endpoint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/m/earnings/summary", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { summary?: { currency?: string } };
        if (!cancelled && json.summary?.currency === "usd") {
          setCountry("US");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function downloadCsv() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/m/earnings/tax-export?year=${year}&format=csv&country=${country}`,
      );
      if (!res.ok) {
        setErr("Couldn't generate export.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `specialcarer-earnings-${country}-${year}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 pt-3 pb-12 space-y-4">
      <Card className="p-4 space-y-3">
        <p className="text-[12px] uppercase tracking-wide text-subheading">
          Tax year
        </p>
        <div className="flex flex-wrap gap-2">
          {YEARS.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-pill border text-[13px] font-semibold ${
                year === y
                  ? "bg-slate-900 border-slate-900 text-white"
                  : "bg-white border-line text-heading"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
        <div>
          <p className="text-[12px] uppercase tracking-wide text-subheading mb-1">
            Country
          </p>
          <div className="flex gap-2">
            {(["GB", "US"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCountry(c)}
                className={`px-3 py-1.5 rounded-pill border text-[13px] font-semibold ${
                  country === c
                    ? "bg-slate-900 border-slate-900 text-white"
                    : "bg-white border-line text-heading"
                }`}
              >
                {c === "GB" ? "United Kingdom" : "United States"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-subheading">
            UK tax year runs 6 Apr – 5 Apr. US tax year is the calendar year.
          </p>
        </div>

        <Button block onClick={downloadCsv} disabled={busy}>
          {busy ? "Preparing…" : "Download CSV"}
        </Button>
        {err && <p className="text-[12px] text-rose-700">{err}</p>}
        <p className="text-[11px] text-subheading">
          PDF export is not yet built in. The CSV imports cleanly into
          Xero, FreeAgent, or QuickBooks. Need a quick read?{" "}
          <a
            href={TAX_LINK[country].href}
            target="_blank"
            rel="noreferrer"
            className="text-primary font-semibold underline"
          >
            {TAX_LINK[country].label}
          </a>
          .
        </p>
      </Card>
    </div>
  );
}
