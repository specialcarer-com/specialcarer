"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, TopBar } from "../../_components/ui";
import JoinInterviewCard from "./JoinInterviewCard";

type InterviewView = {
  id: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: string;
};

function fmtDateLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Family/carer video interview detail. The JoinInterviewCard hides itself when
 * the INTERVIEWS_VIDEO_ENABLED flag is off (the room endpoint 403s), so this
 * page degrades to the schedule summary only.
 */
export default function InterviewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [interview, setInterview] = useState<InterviewView | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/m/interviews/${id}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok && active) {
          setInterview((await res.json()) as InterviewView);
        }
      } catch {
        // schedule card simply won't render
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-app pb-24">
      <TopBar title="Interview" back="/m" />
      <div className="px-4 py-4 space-y-4">
        {interview && (
          <Card>
            <p className="text-[14px] font-bold text-heading mb-1">
              Scheduled
            </p>
            <p className="text-[13px] text-heading">
              {fmtDateLong(interview.scheduledStartAt)}
            </p>
          </Card>
        )}
        <JoinInterviewCard
          interviewId={id}
          scheduledStartAt={interview?.scheduledStartAt ?? ""}
        />
      </div>
    </div>
  );
}
