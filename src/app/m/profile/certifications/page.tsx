"use client";

import { useEffect, useRef, useState } from "react";
import {
  TopBar,
  Button,
  Input,
  IconCert,
  IconPlus,
  IconCheck,
  IconTrash,
} from "../../_components/ui";
import { createClient } from "@/lib/supabase/client";

const PHOTOS_BUCKET = "caregiver-photos";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

type Cert = {
  id: string;
  title: string;
  issuer: string | null;
  issued_at: string | null;
  expires_at: string | null;
  verified_at: string | null;
  document_url: string | null;
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function CertificationsPage() {
  const supabase = createClient();
  const [certs, setCerts] = useState<Cert[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [issuer, setIssuer] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUserId(null);
      setCerts([]);
      setErr("Sign in to manage your certifications.");
      return;
    }
    setUserId(user.id);
    const { data, error } = await supabase
      .from("caregiver_certifications")
      .select(
        "id, title, issuer, issued_at, expires_at, verified_at, document_url",
      )
      .eq("caregiver_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      setErr(error.message);
      setCerts([]);
      return;
    }
    setCerts((data ?? []) as Cert[]);
    setErr(null);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add() {
    if (!title.trim() || !userId) return;
    setBusy(true);
    setErr(null);
    try {
      let documentUrl: string | null = null;
      if (docFile) {
        if (docFile.size > MAX_FILE_BYTES) {
          setErr("File is larger than 5MB.");
          return;
        }
        const ext = (
          docFile.name.split(".").pop() ?? "pdf"
        ).toLowerCase();
        const path = `${userId}/cert-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(PHOTOS_BUCKET)
          .upload(path, docFile, {
            contentType: docFile.type || "application/octet-stream",
            cacheControl: "3600",
            upsert: false,
          });
        if (upErr) {
          setErr(upErr.message);
          return;
        }
        const { data: pub } = supabase.storage
          .from(PHOTOS_BUCKET)
          .getPublicUrl(path);
        documentUrl = pub.publicUrl;
      }
      const { error } = await supabase
        .from("caregiver_certifications")
        .insert({
          caregiver_id: userId,
          title: title.trim().slice(0, 200),
          issuer: issuer.trim() || null,
          issued_at: issuedAt || null,
          expires_at: expiresAt || null,
          document_url: documentUrl,
        });
      if (error) {
        setErr(error.message);
        return;
      }
      setTitle("");
      setIssuer("");
      setIssuedAt("");
      setExpiresAt("");
      setDocFile(null);
      if (docInputRef.current) docInputRef.current.value = "";
      setAdding(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this certification?")) return;
    const { error } = await supabase
      .from("caregiver_certifications")
      .delete()
      .eq("id", id);
    if (error) {
      setErr(error.message);
      return;
    }
    await refresh();
  }

  if (certs === null) {
    return (
      <div className="min-h-screen bg-bg-screen pb-28">
        <TopBar title="Certifications" back="/m/profile" />
        <p className="px-5 pt-6 text-center text-sm text-subheading">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Certifications" back="/m/profile" />

      {err && (
        <p className="mt-3 px-5 text-[12px] text-rose-700">{err}</p>
      )}

      <ul className="mt-2 flex flex-col gap-3 px-5">
        {certs.length === 0 && !adding && (
          <li className="rounded-card bg-white p-6 text-center text-sm text-subheading shadow-card">
            No certifications yet. Add your first below.
          </li>
        )}
        {certs.map((c) => {
          const issued = fmtDate(c.issued_at);
          const expires = fmtDate(c.expires_at);
          return (
            <li
              key={c.id}
              className="flex items-start gap-3 rounded-card bg-white p-4 shadow-card"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-50 text-primary">
                <IconCert />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-bold text-heading">
                  {c.title}
                </p>
                {c.issuer && (
                  <p className="text-[12px] text-subheading">{c.issuer}</p>
                )}
                <p className="mt-0.5 text-[12px] text-subheading">
                  {issued ? `Issued ${issued}` : "Issue date not set"}
                  {expires ? ` · expires ${expires}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {c.verified_at && (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-status-completed px-2 py-0.5 text-[11px] font-semibold text-[#2C7A3F]">
                      <IconCheck /> Verified
                    </span>
                  )}
                  {c.document_url && (
                    <a
                      href={c.document_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-semibold text-primary"
                    >
                      View document
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={() => remove(c.id)}
                className="grid h-8 w-8 place-items-center rounded-full bg-muted text-subheading"
                aria-label="Remove"
              >
                <IconTrash />
              </button>
            </li>
          );
        })}
      </ul>

      {adding && (
        <div className="mt-4 flex flex-col gap-3 px-5">
          <Input
            label="Title"
            placeholder="e.g. DBS Enhanced"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            label="Issuer (optional)"
            placeholder="e.g. Disclosure & Barring Service"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
          />
          <Input
            label="Issued"
            placeholder="YYYY-MM-DD"
            type="date"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
          />
          <Input
            label="Expires (optional)"
            placeholder="YYYY-MM-DD"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
          <label className="block">
            <span className="block text-[14px] font-semibold text-heading mb-1">
              Upload document (optional)
            </span>
            <input
              ref={docInputRef}
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
              className="block text-sm"
            />
            <p className="mt-1 text-[11px] text-subheading">
              Max 5MB. PDFs or images.
            </p>
          </label>
          <div className="flex gap-2">
            <Button variant="outline" block onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button block onClick={add} disabled={!title.trim() || busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}

      {!adding && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
          <Button block onClick={() => setAdding(true)} disabled={!userId}>
            <span className="inline-flex items-center justify-center gap-2">
              <IconPlus /> Add certification
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
