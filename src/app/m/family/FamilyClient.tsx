"use client";

import { useState, useTransition } from "react";
import {
  Card,
  Tag,
  Button,
  Input,
  IconFamily,
  IconUser,
  IconCrown,
  IconTrash,
  IconCheck,
  IconMail,
} from "../_components/ui";
import type {
  FamilyOverview,
  FamilyMember,
  FamilyInvite,
} from "@/lib/family/types";
import { FAMILY_MAX_MEMBERS } from "@/lib/family/types";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function memberDisplayName(m: FamilyMember): string {
  if (m.display_name) return m.display_name;
  if (m.email) return m.email;
  if (m.invited_email) return m.invited_email;
  return "Family member";
}

export default function FamilyClient({
  overview,
  welcome,
}: {
  overview: FamilyOverview | null;
  welcome: boolean;
}) {
  const [data, setData] = useState(overview);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(welcome ? "Welcome to the family. You can now see updates here." : null);
  const [pending, startTransition] = useTransition();
  const [emailInput, setEmailInput] = useState("");
  const [nameInput, setNameInput] = useState("");

  if (!data) {
    return (
      <section className="px-5 pt-8 pb-12 text-center">
        <p className="text-subhead">
          We couldn&apos;t load your family right now. Please try again.
        </p>
      </section>
    );
  }

  const { family, members, invites, is_primary } = data;
  const activeCount = members.filter((m) => m.status === "active").length;
  const invitedCount = members.filter((m) => m.status === "invited").length;
  const remaining = Math.max(
    0,
    FAMILY_MAX_MEMBERS - (activeCount + invitedCount),
  );

  async function refresh() {
    try {
      const res = await fetch("/api/family/me", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as { overview: FamilyOverview };
        setData(json.overview);
      }
    } catch {
      // ignore
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const email = emailInput.trim();
    if (!email) return;
    startTransition(async () => {
      const res = await fetch("/api/family/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          displayName: nameInput.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        emailSent?: boolean;
      };
      if (!res.ok) {
        setError(json.error ?? "Couldn't send invite.");
        return;
      }
      setEmailInput("");
      setNameInput("");
      setInfo(
        json.emailSent
          ? `Invite sent to ${email}.`
          : `Invite created. We couldn't send the email automatically — please share the link from your email client.`,
      );
      await refresh();
    });
  }

  async function handleRevoke(invite: FamilyInvite) {
    if (!confirm(`Revoke invite to ${invite.invited_email}?`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/family/invites/${invite.id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Couldn't revoke invite.");
        return;
      }
      setInfo(`Revoked invite to ${invite.invited_email}.`);
      await refresh();
    });
  }

  async function handleRemove(member: FamilyMember) {
    if (!confirm(`Remove ${memberDisplayName(member)} from your family?`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/family/members/${member.id}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Couldn't remove member.");
        return;
      }
      setInfo(`Removed ${memberDisplayName(member)}.`);
      await refresh();
    });
  }

  return (
    <div className="space-y-4 px-5 pt-5 pb-6">
      {/* Header card */}
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-full text-primary"
            style={{ background: "rgba(3,158,160,0.15)" }}
            aria-hidden
          >
            <IconFamily />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-subheading">
              {is_primary ? "Your family" : "You're part of"}
            </p>
            <p className="text-[18px] font-bold text-heading">
              {family.display_name || "The family circle"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-subheading">
          {is_primary
            ? "Family members see your bookings, chats, and care journal — read-only. Only you can book, message carers and manage payment."
            : "You can see this family's bookings, chats, and care journal updates. The primary contact handles bookings and payments."}
        </p>
      </Card>

      {info && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-[13px] text-emerald-900 flex items-start gap-2">
          <span className="mt-0.5 text-emerald-600"><IconCheck /></span>
          <span>{info}</span>
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-[13px] text-rose-900">
          {error}
        </div>
      )}

      {/* Members list */}
      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-heading">Members</h2>
          <span className="text-[12px] text-subheading">
            {activeCount} active{invitedCount > 0 ? ` · ${invitedCount} pending` : ""}
          </span>
        </div>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => {
            const isPrimaryRow = m.role === "primary";
            return (
              <li key={m.id} className="px-5 py-3 flex items-center gap-3">
                <span
                  className="grid h-9 w-9 place-items-center rounded-full"
                  style={{
                    background: isPrimaryRow
                      ? "rgba(3,158,160,0.15)"
                      : "rgba(23,30,84,0.08)",
                    color: isPrimaryRow ? "#039EA0" : "#171E54",
                  }}
                  aria-hidden
                >
                  {isPrimaryRow ? <IconCrown /> : <IconUser />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-heading truncate">
                    {memberDisplayName(m)}
                  </p>
                  <p className="text-[12px] text-subheading truncate">
                    {isPrimaryRow
                      ? "Primary · books and pays"
                      : m.status === "invited"
                        ? `Invited${m.invited_email ? ` · ${m.invited_email}` : ""}`
                        : m.email && m.email !== memberDisplayName(m)
                          ? m.email
                          : "Member · read only"}
                  </p>
                </div>
                {m.status === "invited" ? (
                  <Tag tone="amber">Pending</Tag>
                ) : isPrimaryRow ? (
                  <Tag tone="primary">Primary</Tag>
                ) : (
                  <Tag tone="green">Active</Tag>
                )}
                {is_primary && !isPrimaryRow && m.status === "active" && (
                  <button
                    type="button"
                    onClick={() => handleRemove(m)}
                    disabled={pending}
                    className="ml-2 grid h-8 w-8 place-items-center rounded-full text-subheading hover:bg-slate-100 disabled:opacity-50"
                    aria-label={`Remove ${memberDisplayName(m)}`}
                  >
                    <IconTrash />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Pending invites (primary only) */}
      {is_primary && invites.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="px-5 pt-4 pb-2">
            <h2 className="text-[15px] font-bold text-heading">
              Pending invites
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {invites.map((inv) => (
              <li key={inv.id} className="px-5 py-3 flex items-center gap-3">
                <span
                  className="grid h-9 w-9 place-items-center rounded-full"
                  style={{ background: "#FFF6E5", color: "#9A6B00" }}
                  aria-hidden
                >
                  <IconMail />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-heading truncate">
                    {inv.display_name || inv.invited_email}
                  </p>
                  <p className="text-[12px] text-subheading truncate">
                    {inv.display_name ? `${inv.invited_email} · ` : ""}Expires {formatDate(inv.expires_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(inv)}
                  disabled={pending}
                  className="text-[13px] font-semibold text-rose-600 disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Invite form (primary only) */}
      {is_primary && (
        <Card className="p-5">
          <h2 className="text-[15px] font-bold text-heading">Invite family</h2>
          <p className="mt-1 text-[13px] text-subheading">
            They&apos;ll get an email with a one-click link.
            {remaining > 0
              ? ` ${remaining} ${remaining === 1 ? "spot" : "spots"} left.`
              : " Family is at the limit — remove someone before inviting more."}
          </p>
          <form className="mt-4 space-y-3" onSubmit={handleInvite}>
            <Input
              type="email"
              required
              placeholder="family@example.com"
              autoComplete="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              disabled={pending || remaining <= 0}
            />
            <Input
              type="text"
              placeholder="Their name (optional)"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              disabled={pending || remaining <= 0}
            />
            <Button
              type="submit"
              disabled={pending || remaining <= 0 || !emailInput.trim()}
            >
              {pending ? "Sending…" : "Send invite"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
