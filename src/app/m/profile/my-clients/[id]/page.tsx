"use client";

import { useParams, useRouter } from "next/navigation";
import {
  TopBar,
  Avatar,
  Tag,
  Button,
  IconPin,
  IconPhone,
  IconMail,
  IconChatBubble,
} from "../../../_components/ui";
import { getClient } from "../../../_lib/clients";

export default function ClientDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const c = getClient(params.id);

  if (!c) {
    return (
      <div className="min-h-screen bg-bg-screen p-6">
        <p className="text-sm text-subheading">Client not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Client details" back="/m/profile/my-clients" />

      <div className="px-5 pt-2">
        <div className="rounded-card bg-white p-5 shadow-card">
          <div className="flex items-center gap-4">
            <Avatar src={c.avatar} name={c.name} size={64} />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold text-heading">{c.name}</p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] text-subheading">
                <IconPin /> {c.city}
              </p>
              <div className="mt-2">
                <Tag tone={c.status === "Active" ? "green" : "neutral"}>
                  {c.status}
                </Tag>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Service" value={c.service} />
            <Stat label="Started" value={c.startedAt} />
            <Stat label="Bookings" value={String(c.totalBookings)} />
            <Stat label="Hours" value={String(c.totalHours)} />
          </div>
        </div>

        <section className="mt-5">
          <h2 className="mb-2 text-[15px] font-bold text-heading">Contact</h2>
          <ul className="overflow-hidden rounded-card bg-white shadow-card">
            <li className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-50 text-primary">
                <IconPhone />
              </span>
              <span className="flex-1 text-[14px] text-heading">{c.phone}</span>
            </li>
            <li className="flex items-center gap-3 border-t border-line px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-50 text-primary">
                <IconMail />
              </span>
              <span className="flex-1 truncate text-[14px] text-heading">{c.email}</span>
            </li>
          </ul>
        </section>

        <section className="mt-5">
          <h2 className="mb-2 text-[15px] font-bold text-heading">Care notes</h2>
          <p className="rounded-card bg-white p-4 text-[14px] leading-relaxed text-heading shadow-card">
            {c.notes}
          </p>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
        <Button block onClick={() => router.push("/m/chat")}>
          <span className="inline-flex items-center justify-center gap-2">
            <IconChatBubble /> Message {c.name.split(" ")[0]}
          </span>
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted p-3">
      <p className="text-[11px] uppercase tracking-wide text-subheading">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold text-heading">{value}</p>
    </div>
  );
}
