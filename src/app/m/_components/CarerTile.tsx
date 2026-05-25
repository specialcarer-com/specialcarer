"use client";

import Link from "next/link";
import { Avatar } from "./ui";
import { serviceLabel } from "@/lib/care/services";

/**
 * Quick-rebook tile shown in the seeker home "Book again" carousel.
 *
 * Cream surface, 12px radius, 1px #D4D1CA border, teal CTA. Tap routes to
 * /m/post-job?prefill=carer%3D{name} (which the post-job page already
 * parses to pre-populate the booking title) — id is preserved for any
 * future direct-rebook flow.
 */
export function CarerTile({
  carerId,
  name,
  avatarUrl,
  service,
}: {
  carerId: string;
  name: string;
  avatarUrl: string | null;
  service: string | null;
}) {
  const display = service ? serviceLabel(service) : null;
  // Pre-fill the post-job flow with the carer name so it shows up in
  // step 1 of the wizard. We also pass `carer=<id>` so a future
  // direct-rebook handler can pick it up server-side.
  const href = `/m/post-job?carer=${encodeURIComponent(
    carerId,
  )}&prefill=${encodeURIComponent(`carer=${name}`)}`;

  return (
    <Link
      href={href}
      className="font-display flex w-[148px] flex-none flex-col items-center gap-2 p-3 sc-no-select"
      style={{
        background: "#FBF8F1",
        border: "1px solid #D4D1CA",
        borderRadius: 12,
      }}
      aria-label={`Book ${name} again`}
    >
      <Avatar src={avatarUrl ?? undefined} name={name} size={64} />
      <p
        className="w-full truncate text-center text-[14px] font-bold"
        style={{ color: "#2F2E31" }}
      >
        {name}
      </p>
      {display && (
        <p
          className="w-full truncate text-center text-[12px] font-semibold"
          style={{ color: "#039EA0" }}
        >
          {display}
        </p>
      )}
      <span
        className="mt-1 inline-flex h-8 w-full items-center justify-center rounded-btn text-[13px] font-bold text-white"
        style={{ background: "#039EA0" }}
      >
        Book again
      </span>
    </Link>
  );
}

export default CarerTile;
