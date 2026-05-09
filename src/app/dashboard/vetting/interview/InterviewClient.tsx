"use client";

import { useEffect, useRef, useState } from "react";
import {
  INTERVIEW_MAX_SECONDS,
  INTERVIEW_VIDEOS_BUCKET,
} from "@/lib/vetting/types";
import { createClient } from "@/lib/supabase/client";

type Submission = {
  prompt_index: number;
  video_path: string;
  duration_seconds: number | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  approved: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-rose-50 text-rose-800 border-rose-200",
};

export default function InterviewClient({
  prompts,
  initial,
}: {
  prompts: string[];
  initial: Submission[];
}) {
  const [submissions, setSubmissions] = useState<Submission[]>(initial);
  const byIdx = new Map(submissions.map((s) => [s.prompt_index, s]));

  function onUploaded(s: Submission) {
    setSubmissions((rows) => {
      const others = rows.filter((r) => r.prompt_index !== s.prompt_index);
      return [...others, s].sort((a, b) => a.prompt_index - b.prompt_index);
    });
  }

  return (
    <ol className="space-y-4">
      {prompts.map((prompt, i) => (
        <li key={i}>
          <PromptCard
            promptIndex={i}
            promptText={prompt}
            current={byIdx.get(i) ?? null}
            onUploaded={onUploaded}
          />
        </li>
      ))}
    </ol>
  );
}

function PromptCard({
  promptIndex,
  promptText,
  current,
  onUploaded,
}: {
  promptIndex: number;
  promptText: string;
  current: Submission | null;
  onUploaded: (s: Submission) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, []);

  async function start() {
    setErr(null);
    setRecordedBlob(null);
    setPreviewUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: true,
      });
      streamRef.current = stream;
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream, { mimeType: "video/webm" });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        if (tickerRef.current) clearInterval(tickerRef.current);
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setElapsed(0);
      tickerRef.current = setInterval(() => {
        setElapsed((s) => {
          const next = s + 1;
          if (next >= INTERVIEW_MAX_SECONDS) {
            try {
              mr.stop();
            } catch {
              /* already stopped */
            }
            setRecording(false);
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : "Could not access camera / microphone.",
      );
    }
  }

  function stop() {
    try {
      recorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    setRecording(false);
  }

  async function upload() {
    if (!recordedBlob) return;
    setUploading(true);
    setErr(null);
    try {
      const sb = createClient();
      const { data: u } = await sb.auth.getUser();
      const userId = u.user?.id;
      if (!userId) {
        setErr("Sign in first.");
        return;
      }
      const path = `${userId}/prompt-${promptIndex}.webm`;
      const { error: upErr } = await sb.storage
        .from(INTERVIEW_VIDEOS_BUCKET)
        .upload(path, recordedBlob, {
          upsert: true,
          contentType: "video/webm",
        });
      if (upErr) {
        setErr(upErr.message);
        return;
      }
      const res = await fetch("/api/carer/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt_index: promptIndex,
          video_path: path,
          duration_seconds: elapsed || null,
        }),
      });
      const json = (await res.json()) as {
        submission?: Submission;
        error?: string;
      };
      if (!res.ok || !json.submission) {
        setErr(json.error ?? "Upload failed.");
        return;
      }
      onUploaded(json.submission);
      setRecordedBlob(null);
      setPreviewUrl(null);
      setElapsed(0);
    } catch {
      setErr("Network error.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Prompt {promptIndex + 1}
          </p>
          <p className="font-semibold text-slate-900 mt-1">{promptText}</p>
        </div>
        {current && (
          <span
            className={`text-[11px] px-2 py-1 rounded-full border font-semibold ${STATUS_TONE[current.status] ?? STATUS_TONE.pending}`}
          >
            {current.status}
          </span>
        )}
      </div>

      {current && current.rejection_reason && (
        <p className="text-xs text-rose-700">
          Rejected: {current.rejection_reason}
        </p>
      )}

      {previewUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={previewUrl} controls className="w-full rounded-lg" />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {!recording && !recordedBlob && (
          <button
            type="button"
            onClick={start}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
          >
            {current ? "Re-record" : "Record (60s)"}
          </button>
        )}
        {recording && (
          <>
            <span className="text-xs text-slate-500">
              Recording… {elapsed}s / {INTERVIEW_MAX_SECONDS}s
            </span>
            <button
              type="button"
              onClick={stop}
              className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700"
            >
              Stop
            </button>
          </>
        )}
        {recordedBlob && !uploading && (
          <button
            type="button"
            onClick={upload}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
          >
            Upload {Math.min(elapsed, INTERVIEW_MAX_SECONDS)}s clip
          </button>
        )}
        {uploading && (
          <span className="text-xs text-slate-500">Uploading…</span>
        )}
      </div>

      {err && <p className="text-xs text-rose-700">{err}</p>}
    </div>
  );
}
