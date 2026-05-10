import { redirect } from "next/navigation";

/**
 * Canonical booking flow lives at /m/book/[id].
 *
 * This legacy route 308-redirects to the unified mobile booking page so that
 * desktop and mobile users go through the same Create Booking → Checkout
 * pipeline backed by /api/m/carer/[id] and /api/stripe/create-booking-intent.
 *
 * Query params (?service=…&starts_at=…) are forwarded so deep-links from
 * search/instant-book continue to work.
 */
export const dynamic = "force-dynamic";

export default async function BookPageRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ caregiverId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { caregiverId } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0]);
  }
  const tail = qs.toString();
  redirect(tail ? `/m/book/${caregiverId}?${tail}` : `/m/book/${caregiverId}`);
}
