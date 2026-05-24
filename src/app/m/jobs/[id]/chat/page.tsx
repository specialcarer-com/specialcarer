import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateBookingThread } from "@/lib/chat/server";

export const dynamic = "force-dynamic";

/**
 * Carer-side deeplink. Resolves a booking id to its chat thread and
 * forwards to the standard /m/chat/<thread_id> screen. Creates the
 * thread on first access so push notifications + the chat tab share
 * a stable target.
 */
export default async function JobsChatRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/m/login?redirect=/m/jobs/${id}/chat`);
  }

  const thread = await getOrCreateBookingThread(id, user.id);
  if (!thread) notFound();
  redirect(`/m/chat/${thread.id}`);
}
