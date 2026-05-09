"use client";

import { useEffect, useRef, useState } from "react";
import {
  Card,
  Button,
  Tag,
  IconMapPin,
  IconClock,
  IconCheck,
  IconCamera,
} from "../../../_components/ui";
import {
  PING_INTERVAL_MS,
  MIN_ACCEPTABLE_ACCURACY_M,
} from "@/lib/tracking/types";
import { createClient } from "@/lib/supabase/client";

type SendResult = "idle" | "ok" | "error";
type SelfieState = "idle" | "uploading" | "saved" | "error";

const PHOTOS_BUCKET = "journal-photos";

export default function ShareClient({
  bookingId,
  bookingStatus,
  hasArrivalSelfie,
}: {
  bookingId: string;
  bookingStatus: string;
  hasArrivalSelfie: boolean;
}) {
  const [sharing, setSharing] = useState(false);
  const [permission, setPermission] = useState<PermissionState | "unsupported">(
    "prompt",
  );
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null);
  const [pingsSent, setPingsSent] = useState(0);
  const [lastResult, setLastResult] = useState<SendResult>("idle");
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPosRef = useRef<GeolocationPosition | null>(null);

  // Arrival selfie state.
  const selfieRef = useRef<HTMLInputElement | null>(null);
  const [selfieState, setSelfieState] = useState<SelfieState>(
    hasArrivalSelfie ? "saved" : "idle",
  );
  const [selfieErr, setSelfieErr] = useState<string | null>(null);

  async function uploadArrivalSelfie(file: File) {
    setSelfieState("uploading");
    setSelfieErr(null);
    try {
      const sb = createClient();
      const { data: userResp } = await sb.auth.getUser();
      const userId = userResp.user?.id;
      if (!userId) {
        setSelfieState("error");
        setSelfieErr("Not signed in.");
        return;
      }
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${userId}/arrival-${bookingId}.${ext}`;
      const { error: upErr } = await sb.storage
        .from(PHOTOS_BUCKET)
        .upload(path, file, {
          upsert: true,
          contentType: file.type || "image/jpeg",
        });
      if (upErr) {
        setSelfieState("error");
        setSelfieErr(upErr.message);
        return;
      }
      const res = await fetch(
        `/api/bookings/${bookingId}/arrival-selfie`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setSelfieState("error");
        setSelfieErr(j.error ?? "Couldn't save arrival selfie.");
        return;
      }
      setSelfieState("saved");
    } catch (e) {
      setSelfieState("error");
      setSelfieErr(e instanceof Error ? e.message : "Upload failed.");
    }
  }

  // Ask the platform what permission state we already have.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermission("unsupported");
      return;
    }
    if (!navigator.permissions) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((res) => {
        setPermission(res.state);
        res.onchange = () => setPermission(res.state);
      })
      .catch(() => undefined);
  }, []);

  async function postPing(pos: GeolocationPosition) {
    try {
      const res = await fetch(`/api/tracking/${bookingId}/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          heading: pos.coords.heading ?? null,
          speedMps: pos.coords.speed ?? null,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setLastResult("error");
        setError(json.error ?? `Server returned ${res.status}.`);
        return;
      }
      setLastResult("ok");
      setError(null);
      setLastSentAt(new Date());
      setPingsSent((n) => n + 1);
    } catch {
      setLastResult("error");
      setError("Network error sending location.");
    }
  }

  function startSharing() {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermission("unsupported");
      setError("This browser doesn't support location sharing.");
      return;
    }
    setSharing(true);

    // watchPosition keeps the GPS warm and gives us low-latency updates.
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        lastPosRef.current = pos;
        if (pos.coords.accuracy && pos.coords.accuracy > MIN_ACCEPTABLE_ACCURACY_M) {
          // Skip very inaccurate fixes; they just confuse the seeker view.
          return;
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setPermission("denied");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. Update browser settings to share."
            : "Couldn't get a location fix.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );

    // Send pings on a fixed cadence using the most recent position.
    intervalRef.current = setInterval(() => {
      const pos = lastPosRef.current;
      if (pos) postPing(pos);
    }, PING_INTERVAL_MS);

    // Also fire one immediately so the seeker sees us straight away.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastPosRef.current = pos;
        if (
          !pos.coords.accuracy ||
          pos.coords.accuracy <= MIN_ACCEPTABLE_ACCURACY_M
        ) {
          postPing(pos);
        }
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  function stopSharing() {
    setSharing(false);
    if (watchIdRef.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    lastPosRef.current = null;
  }

  // Always clean up when the page unmounts (no background broadcast in v1).
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== "undefined") {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="space-y-4 px-4 pt-4 pb-8">
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-full"
            style={{
              background: sharing ? "rgba(3,158,160,0.15)" : "rgba(23,30,84,0.08)",
              color: sharing ? "#039EA0" : "#171E54",
            }}
            aria-hidden
          >
            <IconMapPin />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading">
              Location sharing
            </p>
            <p className="text-[18px] font-bold text-heading">
              {sharing ? "On — broadcasting now" : "Off"}
              {sharing && (
                <span className="ml-2 align-middle">
                  <Tag tone="green">Live</Tag>
                </span>
              )}
            </p>
            <p className="mt-1 text-[12px] text-subhead">
              Booking is{" "}
              <strong className="text-heading">
                {bookingStatus === "paid" ? "paid · on the way" : bookingStatus}
              </strong>
              .
            </p>
          </div>
        </div>
      </Card>

      {/* Arrival selfie — shown until the carer has uploaded one. */}
      {selfieState !== "saved" ? (
        <Card className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span
              className="grid h-10 w-10 flex-none place-items-center rounded-full text-primary"
              style={{ background: "rgba(3,158,160,0.15)" }}
              aria-hidden
            >
              <IconCamera />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-heading">
                Arrival selfie
              </p>
              <p className="mt-0.5 text-[12px] text-subheading">
                Take a quick selfie at the door so the family can see you
                arrived. Used by trust &amp; safety only.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            block
            onClick={() => selfieRef.current?.click()}
            disabled={selfieState === "uploading"}
          >
            {selfieState === "uploading" ? "Uploading…" : "Take arrival selfie"}
          </Button>
          <input
            ref={selfieRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadArrivalSelfie(f);
            }}
          />
          {selfieErr && (
            <p className="text-[12px] text-rose-700">{selfieErr}</p>
          )}
        </Card>
      ) : (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[13px] text-emerald-700">
            <IconCheck /> Arrival selfie saved.
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <p className="text-[13px] text-subhead leading-relaxed">
          We share your location with the seeker (and any family members they&apos;ve
          added) every {Math.round(PING_INTERVAL_MS / 1000)} seconds while
          you&apos;re on this screen. Sharing stops as soon as you leave the page or
          tap stop.
        </p>
        <ul className="text-[12px] text-subhead space-y-1.5">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-primary"><IconCheck /></span>
            <span>Only the seeker and their family members can see your location.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-primary"><IconCheck /></span>
            <span>We never store your location after the booking ends.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-primary"><IconClock /></span>
            <span>Pings sent: {pingsSent}{lastSentAt ? ` · last ${lastSentAt.toLocaleTimeString()}` : ""}</span>
          </li>
        </ul>
      </Card>

      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-[13px] text-rose-900">
          {error}
        </div>
      )}
      {lastResult === "ok" && !error && pingsSent > 0 && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-[13px] text-emerald-900 flex items-start gap-2">
          <span className="mt-0.5 text-emerald-600"><IconCheck /></span>
          <span>The seeker can see your live location.</span>
        </div>
      )}

      {permission === "unsupported" ? (
        <p className="text-center text-[13px] text-subhead">
          This browser doesn&apos;t support location sharing.
        </p>
      ) : sharing ? (
        <Button block variant="danger" onClick={stopSharing}>
          Stop sharing
        </Button>
      ) : (
        <Button block onClick={startSharing}>
          Start sharing my location
        </Button>
      )}
    </div>
  );
}
