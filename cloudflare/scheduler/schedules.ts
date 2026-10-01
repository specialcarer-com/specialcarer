/**
 * Hosting parity snapshot of vercel.json. Deliberately explicit and independently
 * tested against that file: adding a cron route must not activate it implicitly.
 * All expressions are UTC. Shared expressions fan out to EVERY listed path.
 */
export const SCHEDULED_JOBS = [
  { path: "/api/cron/release-payouts", schedule: "0 2 * * *" },
  { path: "/api/cron/release-org-payouts", schedule: "0 3 1 * *" },
  { path: "/api/cron/auto-approve-timesheets", schedule: "0 */6 * * *" },
  { path: "/api/cron/timesheet-reminders", schedule: "30 */6 * * *" },
  { path: "/api/cron/finalise-org-invoices", schedule: "15 */6 * * *" },
  { path: "/api/cron/run-monthly-payroll", schedule: "0 9 * * *" },
  { path: "/api/cron/expire-agency-optin-grace", schedule: "0 4 * * *" },
  { path: "/api/cron/dbs-update-service-recheck", schedule: "12 4 * * *" },
  { path: "/api/cron/dbs-update-service-reminder", schedule: "47 8 * * *" },
  { path: "/api/cron/dbs-update-service-poll", schedule: "23 6 * * *" },
  { path: "/api/cron/booking-reminders", schedule: "0 8 * * *" },
  { path: "/api/cron/expire-match-offers", schedule: "*/2 * * * *" },
  { path: "/api/cron/refresh-caregiver-rates", schedule: "17 3 * * *" },
  { path: "/api/cron/reference-reminders", schedule: "0 9 * * *" },
  { path: "/api/cron/refund-reconciler", schedule: "*/15 * * * *" },
  { path: "/api/cron/refund-reconciliation", schedule: "0 * * * *" },
  { path: "/api/cron/stripe-webhook-recovery", schedule: "*/15 * * * *" },
  { path: "/api/cron/dbs-change-allocations", schedule: "*/10 * * * *" },
  { path: "/api/cron/dsar-fulfil", schedule: "*/15 * * * *" },
  { path: "/api/cron/dsar-retention-sweep", schedule: "0 4 * * *" },
  { path: "/api/cron/payout-digest-weekly", schedule: "0 8 * * 1" },
  { path: "/api/cron/account-deletion-worker", schedule: "0 * * * *" },
  { path: "/api/cron/expire-org-invitations", schedule: "0 3 * * *" },
  { path: "/api/cron/experiment-rollup", schedule: "0 5 * * *" },
  { path: "/api/cron/kpi-rollup-hourly", schedule: "5 * * * *" },
  { path: "/api/cron/care-plan-review-reminder", schedule: "0 6 * * *" },
] as const;

export type JobPath = (typeof SCHEDULED_JOBS)[number]["path"];

export function jobsForSchedule(cron: string): readonly JobPath[] {
  return SCHEDULED_JOBS.filter((job) => job.schedule === cron).map((job) => job.path);
}
