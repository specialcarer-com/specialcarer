import { jobsForSchedule, type JobPath } from "./schedules";

export interface SchedulerEnv {
  APP_ENV?: string;
  SCHEDULER_ENABLED?: string;
  CRON_SECRET?: string;
  APP_ORIGIN?: string;
  APP?: { fetch(request: Request): Promise<Response> };
}

export type DispatchResult =
  | { outcome: "disabled" | "configuration_error" | "unknown_schedule"; status: null }
  | { path: JobPath; outcome: "success" | "http_error" | "network_error" | "timeout"; status: number | null };

type StatusLogger = (result: DispatchResult) => void;
export const MAX_CONCURRENCY = 2;
export const REQUEST_TIMEOUT_MS = 330_000;

/** No response text, request headers, secrets, URLs supplied by callers, or errors are logged. */
function logStatus(result: DispatchResult): void {
  console.log(JSON.stringify(result));
}

/**
 * Service-binding requests only: no global fetch or public-origin fallback.
 * This dispatcher does not retry, replay, or replace application idempotency.
 * The bound application's CRON_SECRET must match this Worker's secret.
 */
export async function dispatchSchedule(
  cron: string,
  env: SchedulerEnv,
  logger: StatusLogger = logStatus,
  // Dependency injection for fast offline timeout tests, never an env override.
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<DispatchResult[]> {
  const finish = (result: DispatchResult): DispatchResult[] => {
    logger(result);
    return [result];
  };
  // Two independent gates: a trigger alone or flag alone cannot start preview jobs.
  if (env.SCHEDULER_ENABLED !== "true" || env.APP_ENV !== "production") {
    return finish({ outcome: "disabled", status: null });
  }
  const paths = jobsForSchedule(cron);
  if (!paths.length) return finish({ outcome: "unknown_schedule", status: null });
  const secret = env.CRON_SECRET;
  const app = env.APP;
  let origin: string | undefined;
  try {
    const url = new URL(env.APP_ORIGIN ?? "");
    if (url.protocol === "https:" && url.origin === env.APP_ORIGIN && !url.username && !url.password) {
      origin = url.origin;
    }
  } catch { /* fail closed below; do not log URL or configuration */ }
  // Header-safe, exact matching secret; never trim/change the value used by the app.
  if (!secret?.trim() || /[\r\n]/.test(secret) || !app || typeof app.fetch !== "function" || !origin) {
    return finish({ outcome: "configuration_error", status: null });
  }
  const budget = Number.isFinite(timeoutMs)
    ? Math.max(1, Math.min(REQUEST_TIMEOUT_MS, timeoutMs))
    : REQUEST_TIMEOUT_MS;
  const results: DispatchResult[] = new Array(paths.length);
  let next = 0;
  async function consume(): Promise<void> {
    while (next < paths.length) {
      const index = next++;
      const path = paths[index];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), budget);
      let result: DispatchResult;
      try {
        // Preserve the app's real origin for handlers/OpenNext origin discovery.
        // APP.fetch still routes through the binding, never public DNS/global fetch.
        const response = await app!.fetch(new Request(`${origin}${path}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${secret}` },
          redirect: "manual", // Never forward a credential to a redirect destination.
          signal: controller.signal,
        }));
        result = { path, status: response.status, outcome: response.ok ? "success" : "http_error" };
        // Consume no body content; cancel the stream so it does not linger.
        try { await response.body?.cancel(); } catch { /* status already captured */ }
      } catch {
        // Provider exception strings may include headers or response data. Never log them.
        result = { path, status: null, outcome: controller.signal.aborted ? "timeout" : "network_error" };
      } finally {
        clearTimeout(timer);
      }
      results[index] = result;
      logger(result);
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, paths.length) }, () => consume()));
  return results;
}

export default {
  // No public HTTP path can invoke a job, even if URL exposure is misconfigured.
  async fetch(): Promise<Response> {
    return new Response("Not Found", { status: 404 });
  },
  async scheduled(event: { cron: string }, env: SchedulerEnv): Promise<void> {
    const results = await dispatchSchedule(event.cron, env);
    if (results.some((result) => result.outcome !== "success" && result.outcome !== "disabled")) {
      // Signal failed invocation to platform monitoring, with no sensitive payload.
      throw new Error("Scheduled dispatch failed; inspect status-only job results.");
    }
  },
};
