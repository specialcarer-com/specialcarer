import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChatRoom } from "../../../_components/ChatRoom";

export const dynamic = "force-dynamic";

/**
 * Carer chat screen — mirror of the seeker view but reads from the
 * carer's perspective: the other party is the seeker, and only the
 * caregiver on the booking may open the page.
 */
export default async function JobChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/m/login?redirect=/m/jobs/${id}/chat`);

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, seeker_id, caregiver_id")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      seeker_id: string;
      caregiver_id: string | null;
    }>();
  if (!booking) notFound();
  if (booking.caregiver_id !== user.id) {
    redirect("/m/jobs");
  }

  const { data: prof } = await admin
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", booking.seeker_id)
    .maybeSingle<{ full_name: string | null; avatar_url: string | null }>();
  const seekerName = prof?.full_name ?? "Care seeker";
  const seekerAvatar = prof?.avatar_url ?? null;

  return (
    <ChatRoom
      bookingId={booking.id}
      currentUserId={user.id}
      otherPartyName={seekerName}
      otherPartyAvatarUrl={seekerAvatar}
      backHref={`/m/jobs/${booking.id}`}
    />
  );
}
