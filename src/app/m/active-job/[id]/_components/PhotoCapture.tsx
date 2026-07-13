"use client";

/**
 * Clock-in selfie capture (Sprint 4.5 v2).
 *
 * A modal overlay that asks for the front camera, shows a live preview with a
 * framing circle, and captures a downscaled JPEG (max 1024x1024). It reports one
 * of four outcomes to the parent and never uploads or posts itself — the parent
 * (GpsClockCard) owns the storage upload + clock POST.
 *
 * Outcomes:
 *   captured — a JPEG blob is ready to upload.
 *   skipped  — hardware unavailable / carer chose to skip (ops review required).
 *   denied   — camera permission refused (clock-in must NOT proceed).
 *   cancelled — carer backed out before capturing.
 *
 * Photo MATCH is advisory and deferred; capture itself is required (with the
 * skip fallback) so every clock-in carries evidence or an explicit flag.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../../_components/ui";

export type PhotoResult =
  | { kind: "captured"; blob: Blob }
  | { kind: "skipped" }
  | { kind: "denied" }
  | { kind: "cancelled" };

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.85;

type Phase = "starting" | "previewing" | "denied" | "unavailable";

function supportsCamera(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}

export default function PhotoCapture({
  onResult,
}: {
  onResult: (result: PhotoResult) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [capturing, setCapturing] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!supportsCamera()) {
      setPhase("unavailable");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {
            /* autoplay can reject; the preview still renders on user gesture */
          });
        }
        setPhase("previewing");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name =
          typeof err === "object" && err && "name" in err
            ? String((err as { name: unknown }).name)
            : "";
        // NotAllowedError / SecurityError → permission denied. Anything else
        // (NotFoundError, NotReadableError, OverconstrainedError) → treat as
        // hardware unavailable so the carer gets the skip fallback.
        setPhase(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : "unavailable",
        );
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  function finish(result: PhotoResult) {
    stop();
    onResult(result);
  }

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    setCapturing(true);

    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight),
    );
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCapturing(false);
      finish({ kind: "skipped" });
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) {
          finish({ kind: "skipped" });
          return;
        }
        finish({ kind: "captured", blob });
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0F1416]/95 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Clock-in photo"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4">
        {phase === "denied" ? (
          <div className="space-y-3 rounded-2xl bg-[#F4EFE6] p-5">
            <p className="text-[15px] font-bold text-heading">
              Camera access required
            </p>
            <p className="text-[13px] text-subheading leading-relaxed">
              A clock-in photo is required. Enable camera access for Special
              Carer in your device settings, then try again.
            </p>
            <Button block variant="outline" onClick={() => finish({ kind: "cancelled" })}>
              Back
            </Button>
          </div>
        ) : phase === "unavailable" ? (
          <div className="space-y-3 rounded-2xl bg-[#F4EFE6] p-5">
            <p className="text-[15px] font-bold text-heading">
              Camera unavailable
            </p>
            <p className="text-[13px] text-subheading leading-relaxed">
              We couldn&apos;t start your camera. You can skip the photo, but
              this shift will be <strong>flagged for ops review</strong>.
            </p>
            <Button block onClick={() => finish({ kind: "skipped" })}>
              Skip photo (ops review required)
            </Button>
            <Button block variant="outline" onClick={() => finish({ kind: "cancelled" })}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <div
              className="relative mx-auto aspect-square w-full max-w-[320px] overflow-hidden rounded-full border-4 border-[#F4EFE6]/80 bg-[#0F1416]"
              data-ph-no-capture
            >
              <video
                ref={videoRef}
                playsInline
                muted
                className="h-full w-full object-cover"
                data-ph-no-capture
              />
            </div>
            <p className="text-center text-[13px] font-semibold text-[#F4EFE6]">
              Position your face in the circle
            </p>
            <Button
              block
              onClick={capture}
              disabled={phase !== "previewing" || capturing}
            >
              {phase !== "previewing"
                ? "Starting camera…"
                : capturing
                  ? "Capturing…"
                  : "Capture"}
            </Button>
            <button
              type="button"
              className="text-center text-[12px] text-[#F4EFE6]/60"
              onClick={() => finish({ kind: "cancelled" })}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
