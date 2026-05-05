"use client";

import { useState } from "react";
import {
  TopBar,
  Button,
  Input,
  IconCert,
  IconPlus,
  IconCheck,
  IconTrash,
} from "../../_components/ui";
import { CAREGIVERS } from "../../_lib/mock";

type Cert = { id: string; title: string; issuedAt: string; verified?: boolean };

export default function CertificationsPage() {
  const seed = CAREGIVERS[0].certifications.map((c, i) => ({
    id: `c${i}`,
    title: c.title,
    issuedAt: c.issuedAt,
    verified: i === 0,
  }));
  const [certs, setCerts] = useState<Cert[]>(seed);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [issuedAt, setIssuedAt] = useState("");

  function add() {
    if (!title || !issuedAt) return;
    setCerts((prev) => [
      ...prev,
      { id: `c${prev.length + 1}`, title, issuedAt, verified: false },
    ]);
    setTitle("");
    setIssuedAt("");
    setAdding(false);
  }

  function remove(id: string) {
    setCerts((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="min-h-screen bg-bg-screen pb-28">
      <TopBar title="Certifications" back="/m/profile" />

      <ul className="mt-2 flex flex-col gap-3 px-5">
        {certs.length === 0 && (
          <li className="rounded-card bg-white p-6 text-center text-sm text-subheading shadow-card">
            No certifications yet. Add your first below.
          </li>
        )}
        {certs.map((c) => (
          <li
            key={c.id}
            className="flex items-start gap-3 rounded-card bg-white p-4 shadow-card"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary-50 text-primary">
              <IconCert />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-bold text-heading">{c.title}</p>
              <p className="mt-0.5 text-[12px] text-subheading">
                Issued {c.issuedAt}
              </p>
              {c.verified && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-pill bg-status-completed px-2 py-0.5 text-[11px] font-semibold text-[#2C7A3F]">
                  <IconCheck /> Verified
                </span>
              )}
            </div>
            <button
              onClick={() => remove(c.id)}
              className="grid h-8 w-8 place-items-center rounded-full bg-muted text-subheading"
              aria-label="Remove"
            >
              <IconTrash />
            </button>
          </li>
        ))}
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
            label="Issue date"
            placeholder="e.g. 04 Mar 2025"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="outline" block onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button block onClick={add} disabled={!title || !issuedAt}>
              Save
            </Button>
          </div>
        </div>
      )}

      {!adding && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white px-5 py-3 sc-safe-bottom">
          <Button block onClick={() => setAdding(true)}>
            <span className="inline-flex items-center justify-center gap-2">
              <IconPlus /> Add certification
            </span>
          </Button>
        </div>
      )}
    </div>
  );
}
