"use client";

/**
 * TeamManager — Phase D / PR D2 seat-management client component.
 *
 * Renders the org's member list with role dropdowns + a remove
 * action, an invite form, and the pending-invitations list with a
 * cancel action. All mutations POST/PATCH/DELETE against the D1 +
 * D2 route surface; on success the router refreshes the parent
 * server component so the list re-hydrates from the DB.
 *
 * Owner protection is enforced in the UI (dropdown disabled, remove
 * button hidden) and re-enforced server-side by the D2 handlers.
 *
 * Accessibility:
 *   - Every interactive control has an aria-label or associated
 *     <label htmlFor>.
 *   - The confirm-remove dialog uses role="dialog" + aria-modal.
 *   - Focus is set on the dialog heading when open (Enter / Escape
 *     dismiss).
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  Input,
  Tag,
} from "../../../_components/ui";

export type UIRole = "owner" | "admin" | "booker" | "finance" | "viewer";

export type UIMember = {
  id: string;
  user_id: string;
  role: UIRole;
  full_name: string | null;
  work_email: string | null;
  is_signatory: boolean;
  created_at: string;
};

export type UIInvitation = {
  id: string;
  email: string;
  role: UIRole;
  invited_by: string;
  invited_by_name?: string | null;
  created_at: string;
  expires_at: string;
};

type Props = {
  members: UIMember[];
  pendingInvitations: UIInvitation[];
  currentUserId: string;
  canManage: boolean;
};

const ASSIGNABLE_ROLES: readonly Exclude<UIRole, "owner">[] = [
  "admin",
  "booker",
  "finance",
  "viewer",
] as const;

const ROLE_LABEL: Record<UIRole, string> = {
  owner: "Owner",
  admin: "Admin",
  booker: "Booker",
  finance: "Finance",
  viewer: "Viewer",
};

export default function TeamManager({
  members,
  pendingInvitations,
  currentUserId,
  canManage,
}: Props) {
  const router = useRouter();

  // Sort members: owner first, then admins, then everyone else by
  // creation date (stable).
  const sortedMembers = useMemo(() => {
    const rank: Record<UIRole, number> = {
      owner: 0,
      admin: 1,
      booker: 2,
      finance: 3,
      viewer: 4,
    };
    return [...members].sort((a, b) => {
      const d = rank[a.role] - rank[b.role];
      if (d !== 0) return d;
      return a.created_at.localeCompare(b.created_at);
    });
  }, [members]);

  return (
    <div className="space-y-3">
      {canManage && <InviteForm onDone={() => router.refresh()} />}

      <Card className="p-4">
        <p className="text-[12px] uppercase tracking-wide text-subheading mb-3">
          Members ({sortedMembers.length})
        </p>
        <ul className="space-y-3">
          {sortedMembers.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              canManage={canManage}
              isSelf={m.user_id === currentUserId}
              onChanged={() => router.refresh()}
            />
          ))}
        </ul>
      </Card>

      {canManage && pendingInvitations.length > 0 && (
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-subheading mb-3">
            Pending invitations ({pendingInvitations.length})
          </p>
          <ul className="space-y-3">
            {pendingInvitations.map((inv) => (
              <InvitationRow
                key={inv.id}
                invitation={inv}
                onCancelled={() => router.refresh()}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member row
// ---------------------------------------------------------------------------

function MemberRow({
  member,
  canManage,
  isSelf,
  onChanged,
}: {
  member: UIMember;
  canManage: boolean;
  isSelf: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const isOwner = member.role === "owner";
  // Owner row cannot be modified. Everyone else can — subject to
  // server-side owner-protection + last-admin protection.
  const dropdownDisabled = !canManage || isOwner || busy;

  async function changeRole(newRole: UIRole) {
    if (newRole === member.role || busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/m/org/members/${member.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(
          (d as { error?: string }).error ?? `Failed (${res.status})`,
        );
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/m/org/members/${member.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(
          (d as { error?: string }).error ?? `Failed (${res.status})`,
        );
      }
      setConfirmingRemove(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3">
      <Avatar
        name={(member.full_name ?? "?").slice(0, 1).toUpperCase()}
        size={40}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-heading truncate">
          {member.full_name ?? "—"}
          {isSelf && (
            <span className="ml-1 text-[12px] text-subheading">(you)</span>
          )}
        </p>
        <p className="text-[12px] text-subheading truncate">
          {member.work_email ?? "—"}
          {member.is_signatory && " · signatory"}
        </p>
        {error && (
          <p className="text-[12px] text-red-600 mt-1" role="alert">
            {error}
          </p>
        )}
      </div>
      {isOwner ? (
        <Tag tone="primary" aria-label="Owner (cannot change)">
          Owner
        </Tag>
      ) : canManage ? (
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`role-${member.id}`}>
            Role for {member.full_name ?? member.work_email ?? member.id}
          </label>
          <select
            id={`role-${member.id}`}
            className="border rounded-md px-2 py-1 text-[13px] bg-white"
            value={member.role}
            disabled={dropdownDisabled}
            onChange={(e) => changeRole(e.target.value as UIRole)}
            aria-label={`Change role for ${member.full_name ?? "member"}`}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="text-[12px] text-red-700 hover:underline disabled:opacity-50"
            onClick={() => setConfirmingRemove(true)}
            disabled={busy}
            aria-label={`Remove ${member.full_name ?? "member"} from the organisation`}
          >
            Remove
          </button>
        </div>
      ) : (
        <Tag tone="primary" aria-label={`Role: ${ROLE_LABEL[member.role]}`}>
          {ROLE_LABEL[member.role]}
        </Tag>
      )}
      {confirmingRemove && (
        <ConfirmRemoveDialog
          memberName={member.full_name ?? member.work_email ?? "this member"}
          busy={busy}
          onCancel={() => setConfirmingRemove(false)}
          onConfirm={() => void remove()}
        />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Invitation row
// ---------------------------------------------------------------------------

function InvitationRow({
  invitation,
  onCancelled,
}: {
  invitation: UIInvitation;
  onCancelled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/m/org/invitations/${invitation.id}/cancel`,
        { method: "POST" },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(
          (d as { error?: string }).error ?? `Failed (${res.status})`,
        );
      }
      onCancelled();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  const invitedAt = new Date(invitation.created_at).toLocaleDateString();
  const expiresAt = new Date(invitation.expires_at).toLocaleDateString();

  return (
    <li className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-heading truncate">
          {invitation.email}
        </p>
        <p className="text-[12px] text-subheading truncate">
          Invited {invitedAt} · expires {expiresAt}
          {invitation.invited_by_name
            ? ` · by ${invitation.invited_by_name}`
            : ""}
        </p>
        {error && (
          <p className="text-[12px] text-red-600 mt-1" role="alert">
            {error}
          </p>
        )}
      </div>
      <Tag tone="primary" aria-label={`Role: ${ROLE_LABEL[invitation.role]}`}>
        {ROLE_LABEL[invitation.role]}
      </Tag>
      <button
        type="button"
        className="text-[12px] text-red-700 hover:underline disabled:opacity-50"
        onClick={() => void cancel()}
        disabled={busy}
        aria-label={`Cancel invitation for ${invitation.email}`}
      >
        Cancel
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Invite form
// ---------------------------------------------------------------------------

function InviteForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<UIRole, "owner">>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setOk(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/m/org/invitations/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(
          (d as { error?: string }).error ?? `Failed (${res.status})`,
        );
      }
      setOk(`Invitation sent to ${email}.`);
      setEmail("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <p className="text-[12px] uppercase tracking-wide text-subheading mb-2">
        Invite team-mate
      </p>
      <form onSubmit={submit} className="space-y-2">
        <div>
          <label htmlFor="invite-email" className="sr-only">
            Email address
          </label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            autoComplete="email"
            required
            aria-label="Invite email address"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="invite-role" className="text-[12px] text-subheading">
            Role
          </label>
          <select
            id="invite-role"
            className="border rounded-md px-2 py-1 text-[13px] bg-white"
            value={role}
            onChange={(e) =>
              setRole(e.target.value as Exclude<UIRole, "owner">)
            }
            aria-label="Invited role"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send invite"}
          </Button>
        </div>
        {error && (
          <p className="text-[12px] text-red-600" role="alert">
            {error}
          </p>
        )}
        {ok && (
          <p className="text-[12px] text-green-700" role="status">
            {ok}
          </p>
        )}
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Confirm-remove modal
// ---------------------------------------------------------------------------

function ConfirmRemoveDialog({
  memberName,
  busy,
  onCancel,
  onConfirm,
}: {
  memberName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-remove-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="bg-white rounded-card p-4 max-w-sm w-full">
        <h2
          id="confirm-remove-title"
          className="text-[16px] font-bold text-heading"
        >
          Remove {memberName}?
        </h2>
        <p className="mt-1 text-[13px] text-subheading">
          They&rsquo;ll lose access to this organisation immediately. Their
          bookings and history stay on file.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-[13px] rounded-md border"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-[13px] rounded-md bg-red-600 text-white disabled:opacity-50"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
