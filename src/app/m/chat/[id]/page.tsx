import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listMessages } from "@/lib/chat/server";
import type { ApiThreadPeer } from "@/lib/chat/client";
import type { Participant } from "@/lib/chat/types";
import ChatThreadClient from "./ChatThreadClient";

export const dynamic = "force-dynamic";

export default async function ChatThreadPage({
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
    redirect(`/signin?next=/m/chat/${id}`);
  }

  const admin = createAdminClient();
  const { data: parts } = await admin
    .from("chat_participants")
    .select("thread_id, user_id, role, joined_at, last_read_at")
    .eq("thread_id", id);
  const participants = (parts ?? []) as Participant[];
  const me = participants.find((p) => p.user_id === user.id);
  if (!me) {
    return (
      <div className="min-h-screen bg-bg-screen p-6">
        <p className="text-sm text-subheading">Conversation not found.</p>
      </div>
    );
  }

  const peer = participants.find((p) => p.user_id !== user.id) ?? null;
  let resolvedPeer: ApiThreadPeer | null = null;
  if (peer) {
    type CarerProfile = {
      display_name: string | null;
      photo_url: string | null;
    };
    type Profile = { full_name: string | null; avatar_url: string | null };
    const [{ data: carer }, { data: prof }] = await Promise.all([
      admin
        .from("caregiver_profiles")
        .select("display_name, photo_url")
        .eq("user_id", peer.user_id)
        .maybeSingle<CarerProfile>(),
      admin
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", peer.user_id)
        .maybeSingle<Profile>(),
    ]);
    resolvedPeer = {
      user_id: peer.user_id,
      role: peer.role,
      display_name: carer?.display_name ?? prof?.full_name ?? null,
      photo_url: carer?.photo_url ?? prof?.avatar_url ?? null,
    };
  }

  const { items } = await listMessages(id, { limit: 50 });
  const initial = [...items].reverse();

  return (
    <ChatThreadClient
      thread_id={id}
      me={user.id}
      peer={resolvedPeer}
      initial={initial}
    />
  );
}
