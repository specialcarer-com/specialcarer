import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ChatRoom } from "../../../_components/ChatRoom";

export const dynamic = "force-dynamic";

/**
 * Seeker chat screen. Server-side we resolve the booking to confirm
 * the caller is the seeker and pull the carer's display name + photo
 * for the header; the client `<ChatRoom>` does the actual messaging
 * (with realtime).
 */
export default async function BookingChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/m/login?redirect=/m/bookings/${id}/chat`);

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

  // Defense-in-depth: only the seeker may use this route. Carers have
  // their own /m/jobs/[id]/chat route.
  if (booking.seeker_id !== user.id) {
    redirect("/m/bookings");
  }

  let carerName = "Caregiver";
  let carerAvatar: string | null = null;
  if (booking.caregiver_id) {
    const [{ data: carer }, { data: prof }] = await Promise.all([
      admin
        .from("caregiver_profiles")
        .select("display_name, photo_url")
        .eq("user_id", booking.caregiver_id)
        .maybeSingle<{ display_name: string | null; photo_url: string | null }>(),
      admin
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", booking.caregiver_id)
        .maybeSingle<{ full_name: string | null; avatar_url: string | null }>(),
    ]);
    carerName =
      carer?.display_name ?? prof?.full_name ?? carerName;
    carerAvatar = carer?.photo_url ?? prof?.avatar_url ?? null;
  }

  return (
    <ChatRoom
      bookingId={booking.id}
      currentUserId={user.id}
      otherPartyName={carerName}
      otherPartyAvatarUrl={carerAvatar}
      backHref={`/m/bookings/${booking.id}`}
      role="seeker"
    />
  );
}
