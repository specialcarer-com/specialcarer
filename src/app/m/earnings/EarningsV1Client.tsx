"use client";

/**
 * Carer earnings dashboard V1 (gap 36).
 *
 * The headline section of /m/earnings: period switcher, big "this period"
 * total with a vs-prior-period delta, an upcoming (not-yet-earned) tile,
 * and a paginated list of recent completed bookings. Backed by
 * GET /api/m/earnings. The legacy payout/tax/referral cards render below
 * this in EarningsClient.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "../_components/ui";

type Period = "this_week" | "this_month" | "last_month" | "all_time";

type ApiBooking = {
  id: string;
  completedAt: string | null;
  seekerLabel: string;
  serviceType: string;
  durationMinutes: number;
  gross: number;
  fee: number;
  net: number;
};

type ApiResponse = {
  period: Period;
  totals: { gross: number; fee: number; net: number; currency: "GBP" };
  deltaPct: number | null;
  upcoming: { gross: number; net: number; count: number };
  bookings: ApiBooking[];
  pagination: { hasMore: boolean; nextCursor: string | null };
};

const PERIODS: ReadonlyArray<Period> = [
  "this_week",
  "this_month",
  "last_month",
  "all_time",
];

function fmtGBP(cents: number): string {
  return `£${(cents / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDuration(mins: number): string {
  if (mins <= 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function EarningsV1Client() {
  const t = useTranslations("earnings");
  const [period, setPeriod] = useState<Period>("this_month");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (p: Period) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/m/earnings?period=${p}&limit=20`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setErr("load_error");
        setData(null);
        return;
      }
      setData((await res.json()) as ApiResponse);
    } catch {
      setErr("load_error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [period, load]);

  const loadMore = useCallback(async () => {
    if (!data?.pagination.nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/m/earnings?period=${period}&limit=20&cursor=${encodeURIComponent(
          data.pagination.nextCursor,
        )}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const next = (await res.json()) as ApiResponse;
      setData((prev) =>
        prev
          ? {
              ...next,
              bookings: [...prev.bookings, ...next.bookings],
            }
          : next,
      );
    } catch {
      /* keep what we have */
    } finally {
      setLoadingMore(false);
    }
  }, [data, period]);

  return (
    <div className="space-y-4">
      {/* Period switcher — pill tabs */}
      <div
        role="tablist"
        aria-label={t("periodSwitcherLabel")}
        className="rounded-pill bg-muted p-1 grid grid-cols-4 gap-1"
      >
        {PERIODS.map((p) => {
          const on = period === p;
          return (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setPeriod(p)}
              className={`h-9 rounded-pill text-[12px] font-semibold transition ${
                on ? "bg-white text-heading shadow-sm" : "text-subheading"
              }`}
            >
              {t(`period.${p}`)}
            </button>
          );
        })}
      </div>

      {/* Headline tile */}
      {loading ? (
        <div className="rounded-card bg-primary/40 h-[132px] animate-pulse" />
      ) : err ? (
        <Card className="p-5 text-center">
          <p className="text-[13px] text-rose-700">{t("loadError")}</p>
          <button
            type="button"
            onClick={() => void load(period)}
            className="mt-2 text-[13px] font-semibold text-primary underline"
          >
            {t("retry")}
          </button>
        </Card>
      ) : data ? (
        <Card className="p-5 bg-primary text-white">
          <p className="text-[12px] uppercase tracking-wide text-white/80">
            {t(`headline.${period}`)}
          </p>
          <p className="mt-1 text-[34px] font-extrabold tabular-nums leading-none">
            {fmtGBP(data.totals.net)}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[12px] text-white/85">
            <span>
              {t("grossLabel")}{" "}
              <span className="tabular-nums">{fmtGBP(data.totals.gross)}</span>
            </span>
            <span aria-hidden>·</span>
            <span>
              {t("feeLabel")}{" "}
              <span className="tabular-nums">{fmtGBP(data.totals.fee)}</span>
            </span>
          </div>
          {data.deltaPct !== null && period !== "all_time" && (
            <p className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold">
              <span aria-hidden>{data.deltaPct >= 0 ? "▲" : "▼"}</span>
              <span className="tabular-nums">
                {Math.abs(data.deltaPct).toFixed(1)}%
              </span>
              <span className="text-white/80 font-normal">
                {t("vsPrior")}
              </span>
            </p>
          )}
        </Card>
      ) : null}

      {/* Upcoming tile */}
      {!loading && !err && data && (
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-subheading">
            {t("upcoming.title")}
          </p>
          <p className="mt-1 text-[20px] font-extrabold text-heading tabular-nums">
            {fmtGBP(data.upcoming.net)}
          </p>
          <p className="text-[12px] text-subheading">
            {t("upcoming.caption", { count: data.upcoming.count })}
          </p>
        </Card>
      )}

      {/* Completed bookings list */}
      <Card className="p-4">
        <p className="text-[12px] uppercase tracking-wide text-subheading">
          {t("list.title")}
        </p>

        {loading ? (
          <div className="mt-3 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-card bg-muted animate-pulse" />
            ))}
          </div>
        ) : data && data.bookings.length === 0 ? (
          <div className="mt-4 text-center">
            <p className="text-[14px] font-semibold text-heading">
              {t("empty.title")}
            </p>
            <p className="mt-1 text-[12px] text-subheading">
              {t("empty.body")}
            </p>
          </div>
        ) : data ? (
          <>
            <ul className="mt-2 divide-y divide-line">
              {data.bookings.map((b) => (
                <li
                  key={b.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-heading truncate">
                      {b.seekerLabel}
                    </p>
                    <p className="text-[12px] text-subheading truncate">
                      {fmtDate(b.completedAt)}
                      {b.serviceType ? ` · ${b.serviceType}` : ""}
                      {b.durationMinutes > 0
                        ? ` · ${fmtDuration(b.durationMinutes)}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[14px] font-bold text-heading tabular-nums">
                      {fmtGBP(b.net)}
                    </p>
                    <p className="text-[11px] text-subheading tabular-nums">
                      {t("rowGrossFee", {
                        gross: fmtGBP(b.gross),
                        fee: fmtGBP(b.fee),
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {data.pagination.hasMore && (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="mt-3 w-full h-11 rounded-btn border border-line bg-white text-[14px] font-semibold text-heading disabled:opacity-60"
              >
                {loadingMore ? t("loadingMore") : t("loadMore")}
              </button>
            )}
          </>
        ) : null}
      </Card>
    </div>
  );
}
