"use client";

/**
 * Client hook that wires the task list HTTP routes + the
 * postgres_changes realtime subscription together for a given booking.
 *
 * - Both the carer and the seeker call this hook with the same booking
 *   id; the only difference is `readOnly`, which disables `toggle()`.
 * - Optimistic toggle: the local row flips immediately, the PATCH fires,
 *   and an error reverts the row (caller renders a toast). The realtime
 *   UPDATE event is de-duped on `id` so the optimistic + server states
 *   converge without flicker.
 * - Realtime is best-effort: if the config fetch or the channel build
 *   fails, the list still works — refresh / next toggle will reconcile.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  fetchTasks,
  fetchTasksRealtimeConfig,
  toggleTask as toggleTaskCall,
  type TasksRealtimeConfig,
} from "./client";
import type { BookingTaskRow } from "./types";

/** Pure: replace the task with id === incoming.id; return prev when not found. */
export function replaceTask(
  prev: BookingTaskRow[],
  incoming: BookingTaskRow,
): BookingTaskRow[] {
  let changed = false;
  const next = prev.map((t) => {
    if (t.id !== incoming.id) return t;
    changed = true;
    return incoming;
  });
  return changed ? next : prev;
}

/** Pure: produce an optimistic patched row given a current row + new done. */
export function optimisticToggle(
  current: BookingTaskRow,
  done: boolean,
  userId: string,
  now: Date,
): BookingTaskRow {
  const iso = now.toISOString();
  return done
    ? {
        ...current,
        done: true,
        done_at: iso,
        done_by: userId,
        updated_at: iso,
      }
    : {
        ...current,
        done: false,
        done_at: null,
        done_by: null,
        updated_at: iso,
      };
}

/** Pure: completion counts for the progress badge. */
export function progress(
  rows: BookingTaskRow[],
): { done: number; total: number } {
  return {
    done: rows.filter((r) => r.done).length,
    total: rows.length,
  };
}

export type UseBookingTasksStatus = "loading" | "ready" | "error";

export type UseBookingTasksState = {
  status: UseBookingTasksStatus;
  tasks: BookingTaskRow[];
  toggle: (taskId: string, done: boolean) => Promise<void>;
  progress: { done: number; total: number };
};

type ChannelLike = {
  on: (
    event: "postgres_changes",
    filter: { event: "UPDATE"; schema: string; table: string; filter: string },
    cb: (payload: { new: BookingTaskRow }) => void,
  ) => ChannelLike;
  subscribe: () => ChannelLike;
};
type ClientLike = {
  channel: (topic: string) => ChannelLike;
  removeChannel: (channel: ChannelLike) => unknown;
};

export type UseBookingTasksDeps = {
  fetchTasks?: (bookingId: string) => Promise<BookingTaskRow[]>;
  fetchRealtimeConfig?: (bookingId: string) => Promise<TasksRealtimeConfig>;
  toggleTask?: (
    bookingId: string,
    taskId: string,
    done: boolean,
  ) => Promise<BookingTaskRow>;
  buildRealtimeClient?: (cfg: TasksRealtimeConfig) => ClientLike | null;
  /** Carer's user id, used for the optimistic done_by stamp. */
  currentUserId?: string | null;
  /** When true (seeker side), `toggle()` rejects. */
  readOnly?: boolean;
};

const DEFAULT_DEPS: Required<
  Omit<UseBookingTasksDeps, "currentUserId" | "readOnly">
> = {
  fetchTasks,
  fetchRealtimeConfig: fetchTasksRealtimeConfig,
  toggleTask: toggleTaskCall,
  buildRealtimeClient: (cfg) => {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    return createBrowserClient(
      cfg.supabaseUrl,
      cfg.supabaseAnonKey,
    ) as unknown as ClientLike;
  },
};

export function useBookingTasks(
  bookingId: string,
  depsOverride?: UseBookingTasksDeps,
): UseBookingTasksState {
  const deps = { ...DEFAULT_DEPS, ...(depsOverride ?? {}) };
  const currentUserId = depsOverride?.currentUserId ?? null;
  const readOnly = depsOverride?.readOnly ?? false;

  const [status, setStatus] = useState<UseBookingTasksStatus>("loading");
  const [tasks, setTasks] = useState<BookingTaskRow[]>([]);
  const tasksRef = useRef<BookingTaskRow[]>([]);
  tasksRef.current = tasks;

  // Bootstrap: initial fetch + realtime subscribe.
  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const initial = await deps.fetchTasks(bookingId);
        if (cancelled) return;
        setTasks(initial);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }

      try {
        const cfg = await deps.fetchRealtimeConfig(bookingId);
        if (cancelled) return;
        const client = deps.buildRealtimeClient(cfg);
        if (!client) return;
        const channel = client
          .channel(cfg.config.channelTopic)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: cfg.config.table,
              filter: cfg.config.filter,
            },
            (payload) => {
              setTasks((prev) => replaceTask(prev, payload.new));
            },
          )
          .subscribe();
        cleanup = () => {
          try {
            client.removeChannel(channel);
          } catch {
            /* ignore */
          }
        };
      } catch {
        // Realtime is best-effort. The list above is already populated.
      }
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [bookingId, deps]);

  const toggle = useCallback(
    async (taskId: string, done: boolean) => {
      if (readOnly) throw new Error("read_only");
      const current = tasksRef.current.find((t) => t.id === taskId);
      if (!current) return;
      const optimistic = optimisticToggle(
        current,
        done,
        currentUserId ?? current.done_by ?? "",
        new Date(),
      );
      // Apply optimistically.
      setTasks((prev) => replaceTask(prev, optimistic));
      try {
        const updated = await deps.toggleTask(bookingId, taskId, done);
        setTasks((prev) => replaceTask(prev, updated));
      } catch (e) {
        // Revert.
        setTasks((prev) => replaceTask(prev, current));
        throw e;
      }
    },
    [bookingId, currentUserId, readOnly, deps],
  );

  return {
    status,
    tasks,
    toggle,
    progress: progress(tasks),
  };
}
