"use client";

import { useState } from "react";
import { Button, Card, Input } from "../../_components/ui";

type Contact = {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
  sort_order: number;
};

const MAX_CONTACTS = 3;

export default function EmergencyContactsClient({
  initialContacts,
}: {
  initialContacts: Contact[];
}) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const atCap = contacts.length >= MAX_CONTACTS;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (atCap || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/emergency-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          relationship: relationship.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        contact?: Contact;
        error?: string;
      };
      if (!res.ok || !json.contact) {
        setErr(json.error ?? "Couldn't save contact.");
        return;
      }
      setContacts((c) => [...c, json.contact!]);
      setName("");
      setPhone("");
      setRelationship("");
    } catch {
      setErr("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const prev = contacts;
    setContacts((c) => c.filter((x) => x.id !== id));
    try {
      const res = await fetch(
        `/api/emergency-contacts?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) setContacts(prev);
    } catch {
      setContacts(prev);
    }
  }

  return (
    <div className="px-5 pt-3 space-y-4">
      <p className="text-[13px] text-subheading">
        We&rsquo;ll email these contacts whenever you raise an SOS during a
        booking. Up to {MAX_CONTACTS} people.
      </p>

      <Card className="p-4">
        {contacts.length === 0 ? (
          <p className="text-[13px] text-subheading">
            No emergency contacts yet.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-heading truncate">
                    {c.name}
                    {c.relationship ? (
                      <span className="text-[12px] font-normal text-subheading">
                        {" "}
                        · {c.relationship}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[12px] text-subheading">{c.phone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  className="px-3 py-1.5 rounded-pill border border-line bg-white text-[12px] font-semibold text-[#C22] hover:bg-muted"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!atCap && (
        <Card className="p-4">
          <h2 className="text-[14px] font-bold text-heading mb-3">
            Add an emergency contact
          </h2>
          <form onSubmit={add} className="space-y-3">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mum"
              required
            />
            <Input
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44 7…"
              type="tel"
              required
            />
            <Input
              label="Relationship (optional)"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="e.g. Sister"
            />
            {err && <p className="text-[12px] text-rose-700">{err}</p>}
            <Button type="submit" block disabled={saving}>
              {saving ? "Saving…" : "Add contact"}
            </Button>
          </form>
        </Card>
      )}

      {atCap && (
        <p className="text-[12px] text-subheading text-center">
          You&rsquo;ve added {MAX_CONTACTS} contacts (the maximum). Remove one
          to add another.
        </p>
      )}
    </div>
  );
}
