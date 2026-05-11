"use client";

/**
 * <TimesheetReviewCard /> + <ConfirmSheet /> + <AdjustSheet /> + <DisputeSheet />
 * + <FLSAWeeklyBanner /> + <PendingAdjustmentCard />
 *
 * Used on /m/bookings/[id] (seeker view) and /m/org/bookings/[id] (org view).
 * Fetches /api/bookings/[id]/timesheet (we use the existing seeker booking
 * detail row's status to render conditionally on the parent). The card
 * shows actual vs booked, GPS-evidence chip, optional photo carousel, tasks
 * completed, and three CTAs: Confirm, Adjust, Dispute.
 *
 * For org bookings, the tip selector is hidden and approve POSTs without
 * `tip_cents`. Seeker bookings get the full tip ladder (No / £5 / £10 / £20 / Custom).
 */

import { useEffect, useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe/client";
import { Button, Card, Tag } from "./ui";

/** Shared Stripe Elements appearance — mirrors the booking checkout flow. */
const STRIPE_APPEARANCE = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#0E7C7B",
    colorText: "#0F1416",
    colorTextSecondary: "#475569",
    colorDanger: "#C22",
    fontFamily:
      "'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, sans-serif",
    borderRadius: "12px",
    spacingUnit: "4px",
  },
};

const KIND_LABEL = {
  overage: "Overage charge",
  overtime: "Overtime premium",
  tip: "Tip",
} as const;

export type PendingConfirmation = {
  payment_id: string;
  kind: "overage" | "overtime" | "tip";
  amount_cents: number;
  currency: string;
  client_secret: string;
  payment_intent_id: string;
};

type Tone = "primary" | "amber" | "green" | "red" | "neutral";

export type TimesheetRow = {
  id: string;
  booking_id: string;
  booking_source: "seeker" | "org";
  status:
    | "pending_approval"
    | "approved"
    | "auto_approved"
    | "disputed"
    | "cancelled";
  submitted_at: string;
  actual_start: string;
  actual_end: string;
  actual_minutes: number;
  booked_minutes: number;
  hourly_rate_cents: number;
  currency: string;
  overage_minutes: number;
  overage_cents: number;
  overage_requires_approval: boolean;
  overage_cap_reason: "duration_1.5x" | "cash_cap" | "both" | null;
  overtime_minutes: number;
  overtime_cents: number;
  gps_verified: boolean;
  forced_check_in: boolean;
  forced_check_out: boolean;
  tasks_completed: string[] | null;
  carer_notes: string | null;
  carer_photos: string[] | null;
  auto_approve_at: string;
  approved_at: string | null;
  dispute_reason: string | null;
  dispute_opened_at: string | null;
  pending_adjustment_id: string | null;
};

export type PendingAdjustment = {
  id: string;
  proposer_role: "carer" | "seeker" | "org_member";
  proposer_user_id: string;
  proposed_start: string;
  proposed_end: string;
  proposed_minutes: number;
  reason: string;
};

function fmtMoney(cents: number, currency: string): string {
  const sym = currency.toUpperCase() === "USD" ? "$" : "£";
  return `${sym}${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function fmtDuration(min: number): string {
  if (min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTimeRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "—";
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(s)}–${fmt(e)}`;
}

function useCountdown(targetIso: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const target = Date.parse(targetIso);
  if (!Number.isFinite(target)) return "—";
  const diff = target - now;
  if (diff <= 0) return "Auto-approving soon…";
  const h = Math.floor(diff / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  return `${h}h ${m}m`;
}

export function TimesheetReviewCard({
  ts,
  pendingAdjustment,
  isOrgView,
  onChanged,
  resumePayment = false,
  onResumeConsumed,
}: {
  ts: TimesheetRow;
  pendingAdjustment: PendingAdjustment | null;
  isOrgView: boolean;
  onChanged: () => void;
  /**
   * When true, the ConfirmSheet opens directly to the Elements step
   * after fetching outstanding `pending_confirmations` from the API.
   * Used by `/m/bookings/[id]?resume_payment=1` (retry email link).
   */
  resumePayment?: boolean;
  onResumeConsumed?: () => void;
}) {
  const [sheet, setSheet] = useState<null | "confirm" | "adjust" | "dispute">(
    null,
  );
  const [resumePendings, setResumePendings] = useState<
    PendingConfirmation[] | null
  >(null);

  // Resume flow — fetch outstanding pending confirmations and open the
  // ConfirmSheet at the Elements step.
  useEffect(() => {
    if (!resumePayment) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/bookings/${ts.booking_id}/timesheet/payments/pending`,
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok) return;
        const j = (await res.json()) as {
          pending_confirmations: PendingConfirmation[];
        };
        if (cancelled) return;
        if ((j.pending_confirmations ?? []).length > 0) {
          setResumePendings(j.pending_confirmations);
          setSheet("confirm");
        }
      } catch {
        /* ignore */
      } finally {
        onResumeConsumed?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumePayment, ts.booking_id, onResumeConsumed]);

  const bookedCost = useMemo(
    () =>
      Math.round((ts.booked_minutes / 60) * ts.hourly_rate_cents),
    [ts.booked_minutes, ts.hourly_rate_cents],
  );
  const actualCost = useMemo(
    () => Math.round((ts.actual_minutes / 60) * ts.hourly_rate_cents),
    [ts.actual_minutes, ts.hourly_rate_cents],
  );

  const isDisputed = ts.status === "disputed";
  const isPending = ts.status === "pending_approval";
  const isApproved = ts.status === "approved" || ts.status === "auto_approved";

  // Read-only summary view once approved or disputed.
  if (!isPending) {
    const tone: Tone = isApproved ? "green" : isDisputed ? "red" : "neutral";
    return (
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-bold text-heading">Timesheet</p>
            <p className="mt-0.5 text-[12px] text-subheading">
              {isApproved ? "Approved" : isDisputed ? "Disputed" : ts.status}
              {ts.status === "auto_approved" ? " (auto)" : ""}
            </p>
          </div>
          <Tag tone={tone}>
            {isApproved ? "Confirmed" : isDisputed ? "Disputed" : ts.status}
          </Tag>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
          <KeyValue label="Booked" value={fmtDuration(ts.booked_minutes)} />
          <KeyValue label="Actual" value={fmtDuration(ts.actual_minutes)} />
        </div>
        {isDisputed && ts.dispute_reason && (
          <p className="mt-3 text-[12px] text-subheading">
            Reason: {ts.dispute_reason}
          </p>
        )}
      </Card>
    );
  }

  // Pending — full review surface.
  const totalDueCents = actualCost + ts.overtime_cents;
  const showOverage = ts.overage_cents > 0;

  return (
    <>
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[14px] font-bold text-heading">
              Review your carer&rsquo;s timesheet
            </p>
            <p className="mt-0.5 text-[12px] text-subheading">
              Auto-approves in <strong>{useCountdown(ts.auto_approve_at)}</strong>
            </p>
          </div>
          <Tag tone="amber">Pending</Tag>
        </div>

        {ts.overage_requires_approval && (
          <div
            className="rounded-xl border p-3 text-[12px]"
            style={{
              background: "rgba(244,162,97,0.10)",
              borderColor: "#F4A261",
              color: "#7A4E1B",
            }}
          >
            <strong>Action required.</strong> This shift ran significantly over
            booked time and won&rsquo;t auto-approve. Please confirm or dispute.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line p-3">
            <p className="text-[11px] uppercase tracking-wide text-subheading">
              Booked
            </p>
            <p className="mt-1 text-[12px] text-heading">
              {fmtDuration(ts.booked_minutes)}
            </p>
            <p className="text-[12px] text-subheading">
              {fmtMoney(bookedCost, ts.currency)}
            </p>
          </div>
          <div className="rounded-xl border border-line p-3">
            <p className="text-[11px] uppercase tracking-wide text-subheading">
              Actual
            </p>
            <p className="mt-1 text-[12px] text-heading">
              {fmtDuration(ts.actual_minutes)}
            </p>
            <p className="text-[12px] text-subheading">
              {fmtMoney(actualCost, ts.currency)}
            </p>
            <p className="text-[10px] text-subheading mt-0.5">
              {fmtTimeRange(ts.actual_start, ts.actual_end)}
            </p>
          </div>
        </div>

        {showOverage && (
          <div className="text-[12px]" style={{ color: "#7A4E1B" }}>
            <strong>Overage:</strong> {fmtDuration(ts.overage_minutes)} ·{" "}
            {fmtMoney(ts.overage_cents, ts.currency)}
          </div>
        )}
        {ts.overtime_cents > 0 && (
          <div className="text-[12px]" style={{ color: "#7A4E1B" }}>
            <strong>FLSA overtime premium:</strong>{" "}
            {fmtMoney(ts.overtime_cents, ts.currency)}{" "}
            ({fmtDuration(ts.overtime_minutes)} @ 0.5×)
          </div>
        )}

        {/* GPS chip */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {ts.gps_verified ? (
            <Tag tone="green">GPS verified</Tag>
          ) : (
            <Tag tone="amber">
              Manual {ts.forced_check_in ? "check-in" : ""}
              {ts.forced_check_in && ts.forced_check_out ? " + " : ""}
              {ts.forced_check_out ? "check-out" : ""}
            </Tag>
          )}
        </div>

        {/* Tasks completed */}
        {ts.tasks_completed && ts.tasks_completed.length > 0 && (
          <div>
            <p className="text-[12px] font-bold text-heading mb-1">
              Tasks completed
            </p>
            <ul className="space-y-1 text-[12px] text-heading">
              {ts.tasks_completed.map((t, i) => (
                <li key={i}>· {t}</li>
              ))}
            </ul>
          </div>
        )}

        {ts.carer_notes && (
          <div>
            <p className="text-[12px] font-bold text-heading mb-1">
              Carer notes
            </p>
            <p className="text-[12px] text-subheading whitespace-pre-wrap">
              {ts.carer_notes}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Button block onClick={() => setSheet("confirm")}>
            Confirm &amp; pay {fmtMoney(totalDueCents, ts.currency)}
          </Button>
          <Button block variant="outline" onClick={() => setSheet("adjust")}>
            Adjust time
          </Button>
          <button
            type="button"
            onClick={() => setSheet("dispute")}
            className="text-[12px] font-bold text-rose-700 underline underline-offset-2 sc-no-select"
          >
            Dispute
          </button>
        </div>
      </Card>

      {pendingAdjustment && (
        <PendingAdjustmentCard
          bookingId={ts.booking_id}
          adjustment={pendingAdjustment}
          isOrgView={isOrgView}
          onChanged={onChanged}
        />
      )}

      {sheet === "confirm" && (
        <ConfirmSheet
          ts={ts}
          isOrgView={isOrgView}
          initialPendings={resumePendings}
          onClose={() => {
            setSheet(null);
            setResumePendings(null);
          }}
          onDone={() => {
            setSheet(null);
            setResumePendings(null);
            onChanged();
          }}
        />
      )}
      {sheet === "adjust" && (
        <AdjustSheet
          ts={ts}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            onChanged();
          }}
        />
      )}
      {sheet === "dispute" && (
        <DisputeSheet
          ts={ts}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-[11px] uppercase tracking-wide text-subheading">
        {label}
      </p>
      <p className="mt-1 text-[12px] text-heading">{value}</p>
    </div>
  );
}

// ── Confirm sheet ───────────────────────────────────────────────────────────
/**
 * Two-step flow:
 *   1. Review — breakdown + tip + (optional) typed reason → POST to approve
 *   2. Confirm payment — Stripe Elements per pending PI, only shown when
 *      the server returned a non-empty `pending_confirmations` array.
 *
 * If `initialPendings` is supplied (resume-payment flow from email link),
 * step 1 is skipped entirely — we jump straight to Elements with the rows
 * the GET /payments/pending endpoint already supplied.
 */
function ConfirmSheet({
  ts,
  isOrgView,
  initialPendings,
  onClose,
  onDone,
}: {
  ts: TimesheetRow;
  isOrgView: boolean;
  initialPendings: PendingConfirmation[] | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tipCents, setTipCents] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Step machine. Resume mode jumps straight to confirm.
  const [pendings, setPendings] = useState<PendingConfirmation[] | null>(
    initialPendings,
  );
  const [doneState, setDoneState] = useState<"none" | "all_done">("none");

  const overageCost = ts.overage_cents;
  const overtimeCost = ts.overtime_cents;
  const bookedCost = Math.round(
    (ts.booked_minutes / 60) * ts.hourly_rate_cents,
  );
  const totalCents = bookedCost + overageCost + overtimeCost + tipCents;
  const needsReason = ts.overage_requires_approval;

  async function submitApproval() {
    if (needsReason && reason.trim().length < 5) {
      setErr("Please add a brief reason (5+ chars).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {};
      if (needsReason) body.typed_reason = reason.trim();
      if (!isOrgView && tipCents > 0) body.tip_cents = tipCents;
      const res = await fetch(
        `/api/bookings/${ts.booking_id}/timesheet/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't confirm.");
        setBusy(false);
        return;
      }
      const json = (await res.json()) as {
        ok: boolean;
        pending_confirmations?: PendingConfirmation[];
      };
      const pc = json.pending_confirmations ?? [];
      if (pc.length === 0) {
        // Happy path — everything captured off-session.
        onDone();
        return;
      }
      // Off-session reuse failed for at least one PI — switch to Elements step.
      setPendings(pc);
      setBusy(false);
    } catch {
      setErr("Network error.");
      setBusy(false);
    }
  }

  // Step 2 — Elements per pending PI.
  if (pendings && pendings.length > 0 && doneState === "none") {
    return (
      <SheetShell onClose={onClose} title="Confirm payment">
        <p className="text-[12px] text-subheading">
          Your timesheet is approved. A couple of charges need one final
          confirmation on your card.
        </p>
        <ElementsConfirmList
          pendings={pendings}
          onAllDone={() => {
            setDoneState("all_done");
          }}
          onPaymentSettled={(payment_id) => {
            // Remove the settled one from the local list so the next renders.
            setPendings((cur) =>
              (cur ?? []).filter((p) => p.payment_id !== payment_id),
            );
          }}
        />
        <p className="text-[10px] text-subheading">
          If you close this window, we&rsquo;ll email you a link to finish later.
        </p>
      </SheetShell>
    );
  }

  // Step 2.5 — all PIs confirmed.
  if (doneState === "all_done") {
    return (
      <SheetShell onClose={onDone} title="Payment confirmed">
        <p className="text-[14px] text-heading font-bold">All done.</p>
        <p className="text-[12px] text-subheading">
          Your card has been charged for the timesheet&rsquo;s extras. The
          carer will see this on their next earnings statement.
        </p>
        <Button block onClick={onDone}>
          Close
        </Button>
      </SheetShell>
    );
  }

  // Step 1 — review.
  return (
    <SheetShell onClose={onClose} title="Confirm timesheet">
      <div className="space-y-2 text-[13px] text-heading">
        <Row label="Booked" value={fmtMoney(bookedCost, ts.currency)} />
        {overageCost > 0 && (
          <Row
            label={`Overage (${fmtDuration(ts.overage_minutes)})`}
            value={fmtMoney(overageCost, ts.currency)}
          />
        )}
        {overtimeCost > 0 && (
          <Row
            label="FLSA overtime"
            value={fmtMoney(overtimeCost, ts.currency)}
          />
        )}
        {!isOrgView && (
          <>
            <p className="text-[12px] font-bold text-heading mt-3">
              Add a tip
            </p>
            <div className="flex flex-wrap gap-2">
              {[0, 500, 1000, 2000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTipCents(v)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold border ${
                    tipCents === v
                      ? "border-primary text-primary"
                      : "border-line text-subheading"
                  }`}
                >
                  {v === 0 ? "No tip" : fmtMoney(v, ts.currency)}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-subheading">
              Tips go 100% to the carer.
            </p>
          </>
        )}
        <Row
          label="Total"
          value={fmtMoney(totalCents, ts.currency)}
          bold
        />
      </div>

      {needsReason && (
        <>
          <p className="text-[12px] font-bold text-heading mt-3">
            Briefly explain why you&rsquo;re approving the overage
          </p>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            className="mt-1 w-full rounded-xl border border-line p-3 text-[14px]"
          />
        </>
      )}

      {err && <p className="text-[12px] text-rose-700">{err}</p>}

      <Button block onClick={submitApproval} disabled={busy}>
        {busy ? "Confirming…" : `Pay ${fmtMoney(totalCents, ts.currency)}`}
      </Button>
    </SheetShell>
  );
}

/**
 * Walks the user through each pending PI sequentially with Stripe Elements.
 * Each row gets its own <Elements> provider (Stripe requires one per
 * client_secret). On success we mark that row settled and advance to the
 * next; on failure we surface the error inline but leave the timesheet
 * approved — the retry email will let the user come back later.
 */
function ElementsConfirmList({
  pendings,
  onAllDone,
  onPaymentSettled,
}: {
  pendings: PendingConfirmation[];
  onAllDone: () => void;
  onPaymentSettled: (payment_id: string) => void;
}) {
  // We render the FIRST pending; once it settles, parent pops it from the
  // list and we re-render with the next. When the list drains, fire
  // onAllDone(). Tracked via a useEffect so we don't run during render.
  const head = pendings[0];

  useEffect(() => {
    if (pendings.length === 0) onAllDone();
  }, [pendings.length, onAllDone]);

  if (!head) return null;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line p-3 text-[12px]">
        <p className="font-bold text-heading">
          {KIND_LABEL[head.kind]} ·{" "}
          <span style={{ color: "#0E7C7B" }}>
            {fmtMoney(head.amount_cents, head.currency)}
          </span>
        </p>
        {pendings.length > 1 && (
          <p className="mt-1 text-subheading">
            {pendings.length - 1} more after this.
          </p>
        )}
      </div>
      <Elements
        // key forces a fresh <Elements> instance per client_secret — Stripe
        // does not support switching clientSecret on a mounted provider.
        key={head.client_secret}
        stripe={getStripe()}
        options={{
          clientSecret: head.client_secret,
          appearance: STRIPE_APPEARANCE,
        }}
      >
        <ElementsConfirmOne
          pending={head}
          onSettled={() => onPaymentSettled(head.payment_id)}
        />
      </Elements>
    </div>
  );
}

function ElementsConfirmOne({
  pending,
  onSettled,
}: {
  pending: PendingConfirmation;
  onSettled: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onConfirm() {
    if (!stripe || !elements || busy) return;
    setBusy(true);
    setErr(null);
    try {
      // return_url must be absolute. We point back at the current page so
      // the user lands here if Stripe needs a 3DS redirect mid-flow.
      const returnUrl =
        typeof window !== "undefined" ? window.location.href : "/";
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: "if_required",
      });
      if (stripeError) {
        setErr(stripeError.message ?? "Couldn't confirm this charge.");
        setBusy(false);
        return;
      }
      // Manual-capture PIs land at `requires_capture`; tips land at `succeeded`.
      if (
        paymentIntent &&
        (paymentIntent.status === "requires_capture" ||
          paymentIntent.status === "succeeded" ||
          paymentIntent.status === "processing")
      ) {
        onSettled();
        return;
      }
      // Unexpected — surface as a soft error but let the user retry.
      setErr(
        paymentIntent?.status
          ? `Payment is in state "${paymentIntent.status}". Please retry.`
          : "Couldn't confirm this charge.",
      );
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "Couldn't confirm this charge.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <PaymentElement />
      {err && (
        <p
          aria-live="polite"
          className="text-[12px] text-[#C22] bg-[#FBEBEB] border border-[#F3CCCC] rounded-btn px-3 py-2"
        >
          {err}
        </p>
      )}
      <Button
        block
        onClick={onConfirm}
        disabled={!stripe || !elements || busy}
      >
        {busy
          ? "Confirming…"
          : `Confirm ${fmtMoney(pending.amount_cents, pending.currency)}`}
      </Button>
    </div>
  );
}

// ── Adjust sheet ────────────────────────────────────────────────────────────
function AdjustSheet({
  ts,
  onClose,
  onDone,
}: {
  ts: TimesheetRow;
  onClose: () => void;
  onDone: () => void;
}) {
  function toLocal(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const [start, setStart] = useState(toLocal(ts.actual_start));
  const [end, setEnd] = useState(toLocal(ts.actual_end));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 10) {
      setErr("Reason must be at least 10 characters.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/bookings/${ts.booking_id}/timesheet/adjust`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposed_start: new Date(start).toISOString(),
            proposed_end: new Date(end).toISOString(),
            reason: reason.trim(),
          }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't submit.");
        setBusy(false);
        return;
      }
      onDone();
    } catch {
      setErr("Network error.");
      setBusy(false);
    }
  }

  return (
    <SheetShell onClose={onClose} title="Adjust time">
      <p className="text-[12px] text-subheading">
        Propose corrected start/end times. The carer must approve.
      </p>
      <label className="block text-[12px] font-bold text-heading mt-2">
        Start
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line p-3 text-[14px] font-normal"
        />
      </label>
      <label className="block text-[12px] font-bold text-heading">
        End
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line p-3 text-[14px] font-normal"
        />
      </label>
      <label className="block text-[12px] font-bold text-heading">
        Reason
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 500))}
          className="mt-1 w-full rounded-xl border border-line p-3 text-[14px] font-normal"
        />
      </label>
      {err && <p className="text-[12px] text-rose-700">{err}</p>}
      <Button block onClick={submit} disabled={busy}>
        {busy ? "Sending…" : "Send proposal"}
      </Button>
    </SheetShell>
  );
}

// ── Dispute sheet ───────────────────────────────────────────────────────────
function DisputeSheet({
  ts,
  onClose,
  onDone,
}: {
  ts: TimesheetRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 10) {
      setErr("Reason must be at least 10 characters.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/bookings/${ts.booking_id}/timesheet/dispute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't open dispute.");
        setBusy(false);
        return;
      }
      onDone();
    } catch {
      setErr("Network error.");
      setBusy(false);
    }
  }

  return (
    <SheetShell onClose={onClose} title="Dispute timesheet">
      <p className="text-[12px] text-subheading">
        Our team will review within 72 hours. Nothing extra is charged until
        resolved.
      </p>
      <textarea
        rows={4}
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 500))}
        placeholder="What's wrong with this timesheet?"
        className="mt-1 w-full rounded-xl border border-line p-3 text-[14px]"
      />
      {err && <p className="text-[12px] text-rose-700">{err}</p>}
      <Button block onClick={submit} disabled={busy}>
        {busy ? "Sending…" : "Open dispute"}
      </Button>
    </SheetShell>
  );
}

// ── Pending adjustment ──────────────────────────────────────────────────────
function PendingAdjustmentCard({
  bookingId,
  adjustment,
  isOrgView,
  onChanged,
}: {
  bookingId: string;
  adjustment: PendingAdjustment;
  isOrgView: boolean;
  onChanged: () => void;
}) {
  // Local-only — we don't know our user role here; assume only the *opposite*
  // party renders this. The route enforces authorisation.
  void isOrgView;
  const [busy, setBusy] = useState(false);
  const [rejectionOpen, setRejectionOpen] = useState(false);
  const [rejection, setRejection] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function respond(action: "approve" | "reject") {
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { action };
      if (action === "reject") body.rejection_reason = rejection.trim();
      const res = await fetch(
        `/api/bookings/${bookingId}/timesheet/adjust/${adjustment.id}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Couldn't submit.");
        setBusy(false);
        return;
      }
      onChanged();
    } catch {
      setErr("Network error.");
      setBusy(false);
    }
  }

  return (
    <Card className="p-4 space-y-2">
      <p className="text-[14px] font-bold text-heading">
        {adjustment.proposer_role === "carer"
          ? "Carer has proposed a time correction"
          : "Family/organisation has proposed a time correction"}
      </p>
      <p className="text-[12px] text-subheading">
        New duration: {fmtDuration(adjustment.proposed_minutes)} ·{" "}
        {fmtTimeRange(adjustment.proposed_start, adjustment.proposed_end)}
      </p>
      <p className="text-[12px] text-subheading">
        Reason: {adjustment.reason}
      </p>
      {!rejectionOpen ? (
        <div className="flex gap-2">
          <Button onClick={() => respond("approve")} disabled={busy}>
            Approve
          </Button>
          <Button
            variant="outline"
            onClick={() => setRejectionOpen(true)}
            disabled={busy}
          >
            Reject
          </Button>
        </div>
      ) : (
        <>
          <textarea
            rows={2}
            value={rejection}
            onChange={(e) => setRejection(e.target.value.slice(0, 500))}
            placeholder="Why are you rejecting?"
            className="w-full rounded-xl border border-line p-3 text-[14px]"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => respond("reject")}
              disabled={busy || rejection.trim().length < 5}
            >
              Send rejection
            </Button>
            <Button variant="outline" onClick={() => setRejectionOpen(false)}>
              Cancel
            </Button>
          </div>
        </>
      )}
      {err && <p className="text-[12px] text-rose-700">{err}</p>}
    </Card>
  );
}

// ── FLSA banner ─────────────────────────────────────────────────────────────
/**
 * Render only when currency='usd' AND weekly minutes (with the same carer)
 * exceed 35h. Parent calculates and passes the minutes; this is a pure
 * presentational component.
 */
export function FLSAWeeklyBanner({
  carerFirstName,
  weeklyMinutes,
}: {
  carerFirstName: string;
  weeklyMinutes: number;
}) {
  if (weeklyMinutes < 35 * 60) return null;
  return (
    <div
      className="rounded-xl border p-3 text-[12px]"
      style={{
        background: "rgba(244,162,97,0.10)",
        borderColor: "#F4A261",
        color: "#7A4E1B",
      }}
    >
      <strong>{carerFirstName}</strong> has worked{" "}
      {fmtDuration(weeklyMinutes)} with you this week. Hours over 40 will be
      billed at 1.5× under US labour law.
    </div>
  );
}

// ── Shared sheet shell ──────────────────────────────────────────────────────
function SheetShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end sm:place-items-center">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[16px] font-bold text-heading">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-subheading text-[20px] leading-none px-2 sc-no-select"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-subheading">{label}</span>
      <span className={bold ? "font-bold text-heading" : "text-heading"}>
        {value}
      </span>
    </div>
  );
}
