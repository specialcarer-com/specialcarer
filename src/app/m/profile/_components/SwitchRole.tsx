"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Role = "seeker" | "caregiver" | "admin";

type RoleStatus = {
  role: Role;
  can_switch: boolean;
  active_bookings: number;
  has_caregiver_profile: boolean;
  has_published_caregiver: boolean;
};

/**
 * Mobile profile-page action that lets a user toggle between
 * 'seeker' and 'caregiver'. Admins are blocked. Active bookings
 * trigger an extra warning before the switch is applied.
 */
export default function SwitchRole({ currentRole }: { currentRole: Role | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RoleStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy-load the warnings only when the user opens the dialog.
  useEffect(() => {
    if (!open || status) return;
    setLoading(true);
    fetch("/api/me/role")
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return (await r.json()) as RoleStatus;
      })
      .then(setStatus)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not load status"),
      )
      .finally(() => setLoading(false));
  }, [open, status]);

  const targetRole: "seeker" | "caregiver" =
    currentRole === "caregiver" ? "seeker" : "caregiver";

  async function submit() {
    setError(null);
    try {
      const res = await fetch("/api/me/role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: targetRole }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        next_steps?: string | null;
      };
      if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
      setOpen(false);
      // If the user just became a carer, send them to their carer setup.
      // Otherwise stay on the profile and let the new sections render.
      if (targetRole === "caregiver") {
        startTransition(() => router.push("/m/profile/edit"));
      } else {
        startTransition(() => router.refresh());
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  // Admin? Don't render at all.
  if (currentRole === "admin") return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-muted/60"
      >
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-50 text-primary">
          <SwapIcon />
        </span>
        <span className="flex-1 text-[14.5px] font-medium text-heading">
          Switch to{" "}
          {targetRole === "caregiver" ? "carer" : "care receiver"}
        </span>
        <ChevronIcon />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-card bg-white p-5 shadow-card sm:rounded-card">
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-heading">
            Switch to {targetRole === "caregiver" ? "carer" : "care receiver"}?
          </h3>
          <button
            onClick={() => setOpen(false)}
            className="text-[18px] text-subheading"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {loading && (
          <p className="mt-3 text-[13px] text-subheading">Checking your account…</p>
        )}

        {status && (
          <div className="mt-3 space-y-3 text-[13.5px] text-heading">
            {targetRole === "caregiver" ? (
              <>
                <p>
                  You'll move to the carer side of the app. You'll need to
                  finish your carer profile (certifications, availability,
                  hourly rate) before clients can find you.
                </p>
                <Tip>
                  Your seeker data (saved carers, journal, family invites) is
                  preserved — you can switch back any time.
                </Tip>
              </>
            ) : (
              <>
                <p>
                  You'll move to the care-receiver side. Your carer profile
                  will be hidden from search but kept intact, so you can
                  re-publish if you switch back.
                </p>
                {status.has_published_caregiver && (
                  <Warn>
                    Your carer profile is currently <strong>published</strong>.
                    It will be unpublished immediately when you switch.
                  </Warn>
                )}
              </>
            )}

            {status.active_bookings > 0 && (
              <Warn>
                You have <strong>{status.active_bookings}</strong> active
                booking{status.active_bookings === 1 ? "" : "s"}. Switching
                roles does not cancel them, but keep an eye on them — you'll
                still need to honour or cancel them in your bookings list.
              </Warn>
            )}
          </div>
        )}

        {error && (
          <p className="mt-3 text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-btn px-3 py-2">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={pending || loading || (status ? !status.can_switch : false)}
            className="flex-1 h-11 rounded-pill bg-primary text-white text-[14.5px] font-semibold disabled:opacity-50"
          >
            {pending
              ? "Switching…"
              : `Switch to ${targetRole === "caregiver" ? "carer" : "care receiver"}`}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="h-11 px-5 rounded-pill border border-line text-heading text-[14.5px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-btn bg-primary-50 px-3 py-2 text-[12.5px] text-primary">
      {children}
    </p>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-btn bg-amber-50 border border-amber-200 px-3 py-2 text-[12.5px] text-amber-900">
      {children}
    </p>
  );
}

function SwapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 7h11l-3-3M17 17H6l3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  );
}
