"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RegShell from "../_components/RegShell";
import { Button } from "../../../_components/ui";
import { DOC_KIND_LABEL, DOC_KINDS, type DocKind } from "@/lib/org/types";
import { createClient } from "@/lib/supabase/client";

const REQUIRED_KINDS: DocKind[] = [
  "registration_certificate",
  "proof_of_address",
  "public_liability_insurance",
];

type Doc = {
  id: string;
  kind: DocKind;
  filename: string | null;
  uploaded_at: string;
  signed_url: string | null;
};

export default function Step7() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState<DocKind | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function refresh() {
    try {
      const res = await fetch("/api/m/org/me", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        org?: { id: string } | null;
        documents?: Doc[];
      };
      setOrgId(json.org?.id ?? null);
      setDocs(json.documents ?? []);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  async function uploadFor(kind: DocKind, file: File) {
    if (!orgId) return;
    setBusy(kind);
    setErr(null);
    try {
      const sb = createClient();
      const { data: u } = await sb.auth.getUser();
      const userId = u.user?.id;
      if (!userId) {
        setErr("Sign in first.");
        setBusy(null);
        return;
      }
      const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
      const path = `${orgId}/${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from("organization-documents")
        .upload(path, file, {
          upsert: true,
          contentType: file.type || "application/octet-stream",
        });
      if (upErr) {
        setErr(upErr.message);
        return;
      }
      const res = await fetch("/api/m/org/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          storage_path: path,
          filename: file.name,
          mime_type: file.type,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(j.error ?? "Upload failed.");
        return;
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const requiredOK = REQUIRED_KINDS.every((k) => docs.some((d) => d.kind === k));

  return (
    <RegShell
      step={7}
      title="Document upload"
      subtitle="Stored privately. Only our trust-and-safety team can see them."
      back="/m/org/register/step-6"
    >
      <ul className="space-y-3">
        {DOC_KINDS.map((k) => {
          const mine = docs.find((d) => d.kind === k);
          const isRequired = (REQUIRED_KINDS as readonly string[]).includes(k);
          return (
            <li
              key={k}
              className="rounded-card border border-line bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-heading">
                    {DOC_KIND_LABEL[k]}
                    {isRequired && (
                      <span className="ml-1 text-rose-600">*</span>
                    )}
                  </p>
                  {mine ? (
                    <p className="mt-1 text-[12px] text-subheading">
                      {mine.filename ?? "Uploaded"} ·{" "}
                      {new Date(mine.uploaded_at).toLocaleDateString("en-GB")}
                    </p>
                  ) : (
                    <p className="mt-1 text-[12px] text-subheading">
                      {isRequired
                        ? "Required for verification."
                        : "Optional — speeds up review."}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileRefs.current[k]?.click()}
                  disabled={busy === k}
                  className="text-[13px] font-semibold text-primary"
                >
                  {busy === k ? "Uploading…" : mine ? "Replace" : "Upload"}
                </button>
                <input
                  ref={(el) => {
                    fileRefs.current[k] = el;
                  }}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadFor(k as DocKind, f);
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      {err && <p className="mt-3 text-[12px] text-rose-700">{err}</p>}
      <div className="mt-5">
        <Button
          block
          disabled={!requiredOK}
          onClick={() => router.push("/m/org/register/step-8")}
        >
          Continue
        </Button>
        {!requiredOK && (
          <p className="mt-2 text-center text-[11px] text-subheading">
            Upload all required documents to continue.
          </p>
        )}
      </div>
    </RegShell>
  );
}
