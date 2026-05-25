/**
 * P0-A4-bis-1: server-side helper that centralises the Supabase
 * realtime channel topic + filter shape for a chat thread. The browser
 * subscribes via `postgres_changes`, with RLS gating delivery. Keeping
 * the topic shape in one place ensures the route handler and the A4-
 * bis-2 client agree on what to subscribe to.
 */
export type ChatRealtimeConfig = {
  channelTopic: string;
  table: "chat_messages";
  filter: string;
};

export function chatRealtimeConfig(threadId: string): ChatRealtimeConfig {
  return {
    channelTopic: `chat:thread:${threadId}`,
    table: "chat_messages",
    filter: `thread_id=eq.${threadId}`,
  };
}
