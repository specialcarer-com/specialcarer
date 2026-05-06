"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  IconCal,
  IconChatBubble,
  IconJournal,
  IconMail,
  IconPhone,
  IconPin,
  IconStar,
  Tag,
  TopBar,
} from "../../_components/ui";
import {
  BOOKINGS,
  SERVICE_LABEL,
  STATUS_TONE,
  getCarer,
} from "../../_lib/mock";

/**
 * Booking detail — built from the same DNA as the booking card,
 * with extra notes section and a sticky message/cancel CTA.
 */

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const booking = BOOKINGS.find((b) => b.id === params.id);
  const carer = booking ? getCarer(booking.carerId) : null;

  if (!booking || !carer) {
    return (
      <main className="min-h-[100dvh] bg-white">
        <TopBar back="/m/bookings" title="Booking" />
        <div className="px-6 mt-10 text-center">
          <p className="text-heading font-semibold">Booking not found</p>
          <Link href="/m/bookings" className="mt-3 inline-block text-primary font-bold">
            Back to bookings
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-bg-screen pb-32">
      <TopBar back="/m/bookings" title="Booking details" />

      <div className="px-4 pt-2 space-y-4">
        <Card>
          <div className="flex items-start gap-3">
            <Avatar src={carer.photo} name={carer.name} size={56} />
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-bold text-heading">{carer.name}</p>
              <p className="text-[12px] text-subheading inline-flex items-center gap-1">
                <IconStar /> {carer.rating.toFixed(1)} · {carer.experienceYears}+ years
              </p>
            </div>
            <Tag tone={STATUS_TONE[booking.status]}>{booking.status}</Tag>
          </div>

          <div className="mt-4">
            <Tag tone="primary">
              {Object.values(SERVICE_LABEL).find(
                (l) => l === booking.service
              ) || booking.service}
            </Tag>
          </div>
        </Card>

        <Card>
          <p className="text-[14px] font-bold text-heading mb-3">Schedule</p>
          <ul className="space-y-2 text-[13px] text-heading">
            <li className="flex items-center gap-2">
              <span className="text-subheading"><IconCal /></span>
              {booking.date}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-subheading"><IconCal /></span>
              {booking.time} · Slot {booking.slot}
            </li>
            <li className="flex items-center gap-2">
              <span className="text-subheading"><IconPin /></span>
              {booking.address}
            </li>
          </ul>
        </Card>

        {booking.notes && (
          <Card>
            <p className="text-[14px] font-bold text-heading mb-2">Notes</p>
            <p className="text-[13px] text-subheading leading-relaxed">
              {booking.notes}
            </p>
          </Card>
        )}

        <Card>
          <p className="text-[14px] font-bold text-heading mb-3">Contact</p>
          <div className="grid grid-cols-3 gap-2">
            <ContactBtn icon={<IconPhone />} label="Call" />
            <ContactBtn icon={<IconMail />} label="Email" />
            <ContactBtn
              icon={<IconChatBubble />}
              label="Message"
              href={`/m/chat/${carer.id}`}
            />
          </div>
        </Card>

        {/* Care journal — entries appear on /m/journal. Once bookings are
            ported to real Supabase rows, the bookingId qs param will tie
            the note to this specific visit; for now the form just creates
            a free-form entry the booking parties can read. */}
        <Card>
          <div className="flex items-start gap-3">
            <span
              className="grid h-10 w-10 flex-none place-items-center rounded-full"
              style={{ background: "rgba(3,158,160,0.10)", color: "#039EA0" }}
              aria-hidden
            >
              <IconJournal />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-heading">Care journal</p>
              <p className="text-[12px] text-subheading mt-0.5">
                Short notes, photos and mood updates from this visit.
              </p>
              <div className="mt-3 flex gap-2">
                <Link href="/m/journal/new" className="flex-1">
                  <Button size="sm" block>Add a note</Button>
                </Link>
                <Link href="/m/journal" className="flex-1">
                  <Button size="sm" variant="outline" block>View journal</Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-white border-t border-line px-4 pt-3 sc-safe-bottom space-y-2">
        {booking.status === "Accepted" && (
          // Live tracking only makes sense once the carer has accepted.
          // For now this opens the Coming Soon screen — the same URL
          // becomes the real Mapbox view in the next session.
          <Link href={`/m/track/${booking.id}`}>
            <Button block>Track carer</Button>
          </Link>
        )}
        {booking.status === "Requested" || booking.status === "Accepted" ? (
          <Button block variant="danger">
            Cancel booking
          </Button>
        ) : booking.status === "Completed" ? (
          <Link href={`/m/carer/${carer.id}`}>
            <Button block>Book again</Button>
          </Link>
        ) : (
          <Link href="/m/search">
            <Button block>Find another carer</Button>
          </Link>
        )}
      </div>
    </main>
  );
}

function ContactBtn({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
}) {
  const inner = (
    <div className="flex flex-col items-center gap-1.5 py-3 rounded-btn bg-primary-50 text-primary">
      {icon}
      <span className="text-[12px] font-bold">{label}</span>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : <button className="w-full">{inner}</button>;
}
