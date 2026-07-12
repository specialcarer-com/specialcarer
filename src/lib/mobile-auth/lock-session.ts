/**
 * Session hydration helper for the biometric lock provider.
 *
 * @supabase/ssr's cookie-backed session can resolve to null on a very fast
 * cold start before the browser client has parsed cookies. This waits for the
 * INITIAL_SESSION auth event (with a timeout fallback) before the lock
 * provider decides whether a session exists.
 */

const DEFAULT_HYDRATION_TIMEOUT_MS = 2000;

export type SessionHydrationDeps = {
  getSession: () => Promise<boolean>;
  subscribeInitialSession: (
    onResolved: (hasSession: boolean) => void,
  ) => () => void;
  timeoutMs?: number;
};

/**
 * Resolve whether a Supabase session is present, waiting briefly for cookie
 * hydration when the first `getSession()` returns false.
 */
export async function waitForHydratedSession(
  deps: SessionHydrationDeps,
): Promise<boolean> {
  const hasSession = await deps.getSession();
  if (hasSession) return true;

  const timeoutMs = deps.timeoutMs ?? DEFAULT_HYDRATION_TIMEOUT_MS;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;

    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (unsubscribe !== undefined) unsubscribe();
      resolve(value);
    };

    unsubscribe = deps.subscribeInitialSession((hydrated) => {
      finish(hydrated);
    });

    timer = setTimeout(() => finish(false), timeoutMs);
  });
}
