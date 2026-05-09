"use client";

import { useEffect, useState } from "react";
import {
  TopBar,
  IconAward,
  IconStar,
  IconCheck,
  IconClock,
  IconCert,
} from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";

type Achievement = {
  achievement_key: string;
  earned: boolean;
  progress_current: number;
  progress_target: number;
  label: string;
  description: string;
};

function iconFor(key: string) {
  switch (key) {
    case "hundred_jobs":
    case "rookie_pro":
      return <IconAward />;
    case "top_rated":
    case "repeat_favourite":
      return <IconStar />;
    case "reliable":
    case "verified_carer":
      return <IconCheck />;
    case "quick_responder":
      return <IconClock />;
    case "dementia_specialist":
      return <IconCert />;
    default:
      return <IconAward />;
  }
}

export default function AchievementsPage() {
  const supabase = createClient();
  const [items, setItems] = useState<Achievement[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setItems([]);
        setErr("Sign in to view your achievements.");
        return;
      }
      const { data, error } = await supabase
        .from("caregiver_achievements_v")
        .select(
          "achievement_key, earned, progress_current, progress_target, label, description",
        )
        .eq("caregiver_id", user.id);
      if (error) {
        setErr(error.message);
        setItems([]);
        return;
      }
      setItems((data ?? []) as Achievement[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items === null) {
    return (
      <div className="min-h-screen bg-bg-screen pb-12">
        <TopBar title="Achievements" back="/m/profile" />
        <p className="px-5 pt-6 text-center text-sm text-subheading">
          Loading…
        </p>
      </div>
    );
  }

  const earned = items.filter((a) => a.earned);
  const inProgress = items.filter((a) => !a.earned);

  return (
    <div className="min-h-screen bg-bg-screen pb-12">
      <TopBar title="Achievements" back="/m/profile" />
      <div className="px-5 pt-3 space-y-6">
        {err && <p className="text-[12px] text-rose-700">{err}</p>}

        <section>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subheading">
            Earned ({earned.length})
          </p>
          {earned.length === 0 ? (
            <div className="rounded-card bg-white p-5 text-center text-[13px] text-subheading shadow-card">
              No achievements yet — keep going!
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {earned.map((a) => (
                <li
                  key={a.achievement_key}
                  className="flex items-start gap-3 rounded-card bg-white p-4 shadow-card"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-50 text-primary">
                    {iconFor(a.achievement_key)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-bold text-heading">
                      {a.label}
                    </p>
                    <p className="mt-0.5 text-[12px] text-subheading">
                      {a.description}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-pill bg-status-completed px-2 py-0.5 text-[11px] font-semibold text-[#2C7A3F]">
                    <IconCheck /> Earned
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-subheading">
            In progress ({inProgress.length})
          </p>
          {inProgress.length === 0 ? (
            <div className="rounded-card bg-white p-5 text-center text-[13px] text-subheading shadow-card">
              All achievements earned. Nice work!
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {inProgress.map((a) => {
                const pct =
                  a.progress_target > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (a.progress_current / a.progress_target) * 100,
                        ),
                      )
                    : 0;
                return (
                  <li
                    key={a.achievement_key}
                    className="flex items-start gap-3 rounded-card bg-white p-4 shadow-card"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-subheading">
                      {iconFor(a.achievement_key)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-bold text-heading">
                        {a.label}
                      </p>
                      <p className="mt-0.5 text-[12px] text-subheading">
                        {a.description}
                      </p>
                      {a.progress_target > 0 && (
                        <div className="mt-2">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="mt-1 text-[11px] text-subheading">
                            {a.progress_current} / {a.progress_target}
                          </p>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
