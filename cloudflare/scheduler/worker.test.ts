import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import worker, { dispatchSchedule, restrictToAllowlist, MAX_CONCURRENCY, type DispatchResult, type SchedulerEnv } from "./worker";
import { jobsForSchedule, SCHEDULED_JOBS } from "./schedules";

const active = { APP_ENV: "production", SCHEDULER_ENABLED: "true", CRON_SECRET: "offline-test-secret",
  APP_ORIGIN: "https://app.invalid" };
const noop = () => {};

test("explicit scheduler map is exactly the existing 26 Vercel definitions / 21 UTC expressions", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.deepEqual(SCHEDULED_JOBS, vercel.crons);
  assert.equal(SCHEDULED_JOBS.length, 26);
  assert.equal(new Set(SCHEDULED_JOBS.map((job) => job.schedule)).size, 21);
  for (const job of SCHEDULED_JOBS) {
    const route = readFileSync(`src/app${job.path}/route.ts`, "utf8");
    assert.match(route, /export async function GET\(/);
    assert.match(route, /requireCronAuth\(req\)/);
  }
  for (const name of ["ai-anomaly-sweep", "ai-feature-refresh", "ai-schedule-predict", "ai-summary-rollup", "compliance-sweep", "reverify-sweep", "surge-recompute"]) {
    assert.equal(SCHEDULED_JOBS.some((job) => job.path === `/api/cron/${name}`), false);
  }
});

test("shared expressions retain every job rather than overwrite one another", () => {
  assert.deepEqual(jobsForSchedule("0 9 * * *"),
    ["/api/cron/run-monthly-payroll", "/api/cron/reference-reminders"]);
  assert.deepEqual(jobsForSchedule("*/15 * * * *"),
    ["/api/cron/refund-reconciler", "/api/cron/stripe-webhook-recovery", "/api/cron/dsar-fulfil"]);
  assert.equal(jobsForSchedule("unknown").length, 0);
});

test("off by default and previews cannot dispatch even if enable flag is set", async () => {
  const app = { fetch: async (): Promise<Response> => { assert.fail("must not dispatch"); } };
  for (const flags of [{}, { SCHEDULER_ENABLED: "true" }, { APP_ENV: "production" },
    { APP_ENV: "preview", SCHEDULER_ENABLED: "true" }, { APP_ENV: "production", SCHEDULER_ENABLED: "1" }]) {
    assert.deepEqual(await dispatchSchedule("0 2 * * *", { ...flags, APP: app }, noop),
      [{ outcome: "disabled", status: null }]);
  }
  assert.equal((await worker.fetch()).status, 404);
});

test("missing binding, missing/invalid secret, or unknown schedule fail before any call", async () => {
  let calls = 0;
  const APP = { fetch: async () => { calls++; return new Response(null); } };
  for (const secret of [undefined, "", " ", "bad\nsecret"]) {
    assert.equal((await dispatchSchedule("0 2 * * *", { ...active, CRON_SECRET: secret, APP }, noop))[0].outcome,
      "configuration_error");
  }
  assert.equal((await dispatchSchedule("0 2 * * *", active, noop))[0].outcome, "configuration_error");
  for (const APP_ORIGIN of [undefined, "", "http://app.invalid", "https://user:pass@app.invalid",
    "https://app.invalid/path", "https://app.invalid?query=1"]) {
    assert.equal((await dispatchSchedule("0 2 * * *", { ...active, APP_ORIGIN, APP }, noop))[0].outcome,
      "configuration_error");
  }
  assert.equal((await dispatchSchedule("unknown\nsensitive", { ...active, APP }, noop))[0].outcome, "unknown_schedule");
  assert.equal(calls, 0);
});

test("dispatch is GET with exact bearer, manual redirects, service binding and bounded concurrency", async () => {
  let running = 0;
  let maximum = 0;
  const requests: Request[] = [];
  const APP = {
    async fetch(request: Request): Promise<Response> {
      requests.push(request);
      running++;
      maximum = Math.max(maximum, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return new Response("BODY MUST NOT BE LOGGED", { status: 200 });
    },
  };
  const results = await dispatchSchedule("*/15 * * * *", { ...active, APP }, noop);
  assert.equal(requests.length, 3);
  assert.equal(maximum, MAX_CONCURRENCY);
  assert.ok(results.every((result) => result.outcome === "success"));
  for (const request of requests) {
    assert.equal(request.method, "GET");
    assert.equal(request.headers.get("Authorization"), "Bearer offline-test-secret");
    assert.equal(request.redirect, "manual");
    assert.equal(new URL(request.url).hostname, "app.invalid");
    assert.equal(request.signal.aborted, false);
  }
});

test("HTTP errors and provider exceptions log safe statuses only and are not retried", async () => {
  let calls = 0;
  const logs: DispatchResult[] = [];
  const APP = {
    async fetch(): Promise<Response> {
      calls++;
      if (calls === 2) throw new Error("EXCEPTION_WITH_SECRET");
      return new Response("PRIVATE_RESPONSE_DATA", { status: calls === 1 ? 302 : 503 });
    },
  };
  const results = await dispatchSchedule("*/15 * * * *", { ...active, APP }, (result) => logs.push(result));
  assert.equal(calls, 3);
  assert.deepEqual(results.map((r) => r.status), [302, null, 503]);
  assert.deepEqual(results.map((r) => r.outcome), ["http_error", "network_error", "http_error"]);
  assert.doesNotMatch(JSON.stringify(logs), /SECRET|PRIVATE|offline-test-secret|Bearer/);
  assert.equal(logs.length, 3);
});

test("timeout aborts the bound request without logging its error or retrying", async () => {
  let calls = 0;
  const APP = {
    fetch(request: Request): Promise<Response> {
      calls++;
      return new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(new Error("SENSITIVE_TIMEOUT")), { once: true });
      });
    },
  };
  const results = await dispatchSchedule("0 2 * * *", { ...active, APP }, noop, 2);
  assert.deepEqual(results, [{ path: "/api/cron/release-payouts", status: null, outcome: "timeout" }]);
  assert.equal(calls, 1);
});

test("checked-in scheduler config has no public exposure, secrets or active schedules", () => {
  // This JSONC has only full-line comments, so strip those before parsing.
  const config = JSON.parse(readFileSync("cloudflare/scheduler/wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, ""));
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.triggers.crons, []);
  assert.equal(config.vars.SCHEDULER_ENABLED, "false");
  assert.equal(config.vars.APP_ENV, "preview");
  assert.equal(config.vars.CRON_SECRET, undefined);
  assert.equal(config.routes, undefined);
  assert.deepEqual(config.services, [{ binding: "APP", service: "specialcarer-preview" }]);
});

test("scheduled handler surfaces failure without including provider details", async () => {
  const originalLog = console.log;
  const messages: string[] = [];
  console.log = (message: string) => { messages.push(message); };
  try {
    const env: SchedulerEnv = { ...active, APP: { fetch: async () => { throw new Error("PRIVATE_PROVIDER_ERROR"); } } };
    await assert.rejects(() => worker.scheduled({ cron: "0 2 * * *" }, env), /Scheduled dispatch failed/);
    assert.doesNotMatch(messages.join(" "), /PRIVATE|Bearer|offline-test-secret/);
  } finally {
    console.log = originalLog;
  }
});

test("restrictToAllowlist is a no-op when the allowlist is absent - every existing Worker's behaviour is unchanged", () => {
  const paths = jobsForSchedule("0 9 * * *");
  assert.deepEqual(restrictToAllowlist(paths, undefined), paths);
  assert.deepEqual(restrictToAllowlist([], undefined), []);
});

test("restrictToAllowlist intersects rather than trusts the allowlist outright - it can only narrow, never add a path", () => {
  const resolved = jobsForSchedule("0 9 * * *");
  assert.deepEqual(
    [...resolved].sort(),
    ["/api/cron/reference-reminders", "/api/cron/run-monthly-payroll"].sort(),
    "this test's premise is the real collision - if schedules.ts changes, update this test",
  );
  // A path that was never actually resolved for this cron cannot be
  // smuggled in via the allowlist, even if named explicitly.
  const result = restrictToAllowlist(resolved, "/api/cron/reference-reminders,/api/cron/release-payouts");
  assert.deepEqual(result, ["/api/cron/reference-reminders"]);
});

test("restrictToAllowlist resolves the real reference-reminders / run-monthly-payroll collision down to exactly one job", () => {
  const resolved = jobsForSchedule("0 9 * * *");
  assert.deepEqual(
    restrictToAllowlist(resolved, "/api/cron/reference-reminders"),
    ["/api/cron/reference-reminders"],
  );
});

test("restrictToAllowlist fails closed (empty result) rather than open when the allowlist matches nothing", () => {
  const resolved = jobsForSchedule("0 9 * * *");
  assert.deepEqual(restrictToAllowlist(resolved, ""), []);
  assert.deepEqual(restrictToAllowlist(resolved, "/api/cron/some-typo-path"), []);
});

test("dispatchSchedule surfaces a fully-filtered-out allowlist as unknown_schedule, which the scheduled handler then reports as a failure", async () => {
  const env: SchedulerEnv = { ...active, DISPATCH_PATH_ALLOWLIST: "/api/cron/some-typo-path" };
  const results = await dispatchSchedule("0 9 * * *", env);
  assert.deepEqual(results, [{ outcome: "unknown_schedule", status: null }]);
  await assert.rejects(
    () => worker.scheduled({ cron: "0 9 * * *" }, env),
    /Scheduled dispatch failed/,
  );
});

test("dispatchSchedule with a real allowlist dispatches only the allowed job, even though the cron resolves to two", async () => {
  const calledPaths: string[] = [];
  const APP = {
    async fetch(request: Request): Promise<Response> {
      calledPaths.push(new URL(request.url).pathname);
      return new Response(null, { status: 200 });
    },
  };
  const env: SchedulerEnv = {
    ...active,
    APP,
    DISPATCH_PATH_ALLOWLIST: "/api/cron/reference-reminders",
  };
  const results = await dispatchSchedule("0 9 * * *", env);
  assert.deepEqual(calledPaths, ["/api/cron/reference-reminders"]);
  assert.deepEqual(results, [
    { path: "/api/cron/reference-reminders", status: 200, outcome: "success" },
  ]);
});
