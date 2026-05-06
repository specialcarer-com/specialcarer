import Link from "next/link";
import { listUsersForAdmin, type UsersFilter, type UserRole } from "@/lib/admin/users";
import AddUser from "./_components/AddUser";

export const dynamic = "force-dynamic";

const ROLES: { key: UserRole | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "seeker", label: "Seekers" },
  { key: "caregiver", label: "Caregivers" },
  { key: "admin", label: "Admins" },
];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildQs(
  filter: UsersFilter,
  overrides: Partial<UsersFilter & { page: number }>,
) {
  const merged = { ...filter, ...overrides };
  const params = new URLSearchParams();
  if (merged.role && merged.role !== "all") params.set("role", merged.role);
  if (merged.country && merged.country !== "all")
    params.set("country", merged.country);
  if (merged.q) params.set("q", merged.q);
  if ("page" in overrides && overrides.page && overrides.page > 1)
    params.set("page", String(overrides.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{
    role?: string;
    country?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const filter: UsersFilter = {
    role: (sp.role as UserRole | "all") || "all",
    country: (sp.country as "GB" | "US" | "all") || "all",
    q: sp.q || undefined,
  };
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const { rows, total, totalPages } = await listUsersForAdmin(filter, page);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500 mt-1">
            All accounts (seekers, caregivers, admins). Click a row for full
            profile, KYC, and bookings.
          </p>
        </div>
        <AddUser />
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {ROLES.map((r) => {
          const active = filter.role === r.key;
          return (
            <Link
              key={r.key}
              href={`/admin/users${buildQs(filter, { role: r.key, page: 1 })}`}
              className={`px-3 py-2 text-sm border-b-2 -mb-px ${
                active
                  ? "border-brand text-slate-900 font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {r.label}
            </Link>
          );
        })}
      </div>

      <form
        method="get"
        action="/admin/users"
        className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-2xl p-4"
      >
        <input type="hidden" name="role" value={filter.role ?? "all"} />
        <div>
          <label className="block text-xs text-slate-500 mb-1">Country</label>
          <select
            name="country"
            defaultValue={filter.country ?? "all"}
            className="text-sm border border-slate-300 rounded-md px-2 py-1"
          >
            <option value="all">All</option>
            <option value="GB">UK</option>
            <option value="US">US</option>
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-slate-500 mb-1">
            Search (email or name)
          </label>
          <input
            type="text"
            name="q"
            defaultValue={filter.q ?? ""}
            placeholder="@example.com or Smith"
            className="w-full text-sm border border-slate-300 rounded-md px-2 py-1"
          />
        </div>
        <button
          type="submit"
          className="text-sm font-medium px-4 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800"
        >
          Apply
        </button>
        {(filter.country !== "all" || filter.q) && (
          <Link
            href={`/admin/users${buildQs({ role: filter.role }, { page: 1 })}`}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No users match these filters on this page.
          {totalPages > 1 && " Try the next page."}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Country</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                <th className="text-left px-4 py-3 font-medium">Last sign-in</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-slate-900 hover:underline"
                    >
                      {u.full_name ?? "(no name)"}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {u.email ?? u.id.slice(0, 8)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {u.role ? (
                      <span
                        className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md ${
                          u.role === "admin"
                            ? "bg-amber-50 text-amber-700"
                            : u.role === "caregiver"
                              ? "bg-violet-50 text-violet-700"
                              : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {u.role}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                    {u.role === "caregiver" && (
                      <div className="text-xs text-slate-500 mt-1">
                        {u.is_published ? "Published" : "Hidden"}
                        {u.city ? ` · ${u.city}` : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {u.country ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {fmtDate(u.created_at)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {fmtDate(u.last_sign_in_at)}
                  </td>
                  <td className="px-4 py-3">
                    {u.banned_until && u.banned_until !== "none" ? (
                      <span className="text-xs text-rose-700 font-medium">
                        Blocked
                      </span>
                    ) : u.email_confirmed_at ? (
                      <span className="text-xs text-emerald-700 font-medium">
                        Verified
                      </span>
                    ) : (
                      <span className="text-xs text-amber-700 font-medium">
                        Unverified
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          Page {page} of {totalPages} · {total} total accounts
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/users${buildQs(filter, { page: page - 1 })}`}
              className="px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
            >
              ← Prev
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/admin/users${buildQs(filter, { page: page + 1 })}`}
              className="px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
            >
              Next →
            </Link>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Note: filters apply within the current page of accounts. Use
        email/name search to find specific users across all pages.
      </p>
    </div>
  );
}
