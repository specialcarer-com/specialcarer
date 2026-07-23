"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "../../_components/ui";

type HouseholdMember = { user_id: string; display_name: string | null };

type DesignatedPayerResponse = {
  designatedPayerUserId: string | null;
  designatedPayerName: string | null;
  isFlagEnabled: boolean;
  householdAdults: HouseholdMember[];
};

/**
 * Designated Payer (gap 31). Lets the booking's seeker nominate another adult
 * in their household to be billed. Renders nothing unless the feature flag is
 * on (the GET endpoint returns isFlagEnabled:false / 403 when off) and the
 * caller is the seeker. Only the seeker can change the payer.
 */
export default function DesignatedPayerCard({
  bookingId,
  isSeeker,
}: {
  bookingId: string;
  isSeeker: boolean;
}) {
  const [data, setData] = useState<DesignatedPayerResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState<string | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/m/bookings/${bookingId}/designated-payer`,
        { credentials: "include", cache: "no-store" },
      );
      if (!res.ok) {
        setLoaded(true);
        return;
      }
      const json = (await res.json()) as DesignatedPayerResponse;
      if (json.isFlagEnabled) setData(json);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, [bookingId]);

  useEffect(() => {
    if (isSeeker) void load();
    else setLoaded(true);
  }, [isSeeker, load]);

  const setPayer = useCallback(
    async (payerUserId: string | null) => {
      setSaving(payerUserId ?? "clear");
      setError(null);
      try {
        const res = await fetch(
          `/api/m/bookings/${bookingId}/designated-payer`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payerUserId }),
          },
        );
        const json = (await res.json()) as
          | DesignatedPayerResponse
          | { error: string };
        if (!res.ok) {
          setError(
            "error" in json ? json.error : "Couldn't update the payer.",
          );
          return;
        }
        setData(json as DesignatedPayerResponse);
      } catch {
        setError("Couldn't update the payer.");
      } finally {
        setSaving(null);
      }
    },
    [bookingId],
  );

  // Hidden entirely when: not the seeker, flag off, or still loading.
  if (!isSeeker || !loaded || !data) return null;

  const currentName =
    data.designatedPayerName ??
    (data.designatedPayerUserId
      ? "Another household member"
      : "You (seeker)");

  return (
    <Card>
      <p className="text-[14px] font-bold text-heading mb-1">Who pays</p>
      <p className="text-[12px] text-subheading mb-3 leading-relaxed">
        Nominate another adult in your SpecialCarer household to be billed for
        this booking. Current payer:{" "}
        <span className="font-semibold text-heading">{currentName}</span>.
      </p>

      {error && (
        <p
          className="text-[12px] mb-3"
          style={{ color: "#C0362C" }}
          role="alert"
        >
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {data.householdAdults.map((m, i) => {
          // NULL payer == seeker pays; the seeker is always first in the list.
          const isCurrent = data.designatedPayerUserId
            ? m.user_id === data.designatedPayerUserId
            : i === 0;
          return (
            <li
              key={m.user_id}
              className="flex items-center justify-between gap-3 rounded-card border border-line px-3 py-2"
            >
              <span className="text-[13px] text-heading truncate">
                {m.display_name ?? "Household member"}
              </span>
              {isCurrent ? (
                <span
                  className="text-[12px] font-bold"
                  style={{ color: "#039EA0" }}
                >
                  Current payer
                </span>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setPayer(m.user_id)}
                  disabled={saving !== null}
                >
                  {saving === m.user_id ? "Saving…" : "Set as payer"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {data.designatedPayerUserId && (
        <div className="mt-3">
          <Button
            size="sm"
            variant="outline"
            block
            onClick={() => setPayer(null)}
            disabled={saving !== null}
          >
            {saving === "clear" ? "Saving…" : "Reset to me (seeker pays)"}
          </Button>
        </div>
      )}
    </Card>
  );
}
