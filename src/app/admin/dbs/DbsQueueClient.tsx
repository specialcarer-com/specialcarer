"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type DbsQueueRow = {
  id: string;
  carer_id: string;
  carer_name: string;
  avatar_url: string | null;
  kind: "adult" | "child";
  status: string;
  vendor: string | null;
  vendor_reference: string | null;
  submitted_at: string | null;
  recovery_status: string | null;
  created_at: string;
};

type SortKey = "submitted_at" | "carer_name" | "kind";

export default function DbsQueueClient({
  initialRows,
}: {
  initialRows: DbsQueueRow[];
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("submitted_at");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? initialRows.filter(
          (r) =>
            r.carer_name.toLowerCase().includes(q) ||
            (r.vendor_reference ?? "").toLowerCase().includes(q),
        )
      : initialRows;
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "carer_name") return a.carer_name.localeCompare(b.carer_name);
      if (sort === "kind") return a.kind.localeCompare(b.kind);
      // submitted_at ascending (oldest first); nulls last
      const av = a.submitted_at ?? a.created_at;
      const bv = b.submitted_at ?? b.created_at;
      return new Date(av).getTime() - new Date(bv).getTime();
    });
    return sorted;
  }, [initialRows, search, sort]);

  if (initialRows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600">
        No applications awaiting review. ✓
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by carer or vendor reference…"
          className="flex-1 min-w-[220px] px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        >
          <option value="submitted_at">Oldest first</option>
          <option value="carer_name">Carer name</option>
          <option value="kind">Workforce kind</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Carer</th>
              <th className="px-4 py-2 font-medium">Kind</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Recovery</th>
              <th className="px-4 py-2 font-medium">Submitted</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {r.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.avatar_url}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-200" />
                    )}
                    <span className="font-medium text-slate-900">
                      {r.carer_name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 capitalize">{r.kind}</td>
                <td className="px-4 py-3 capitalize">{r.status.replace("_", " ")}</td>
                <td className="px-4 py-3 capitalize">
                  {(r.recovery_status ?? "—").replace("_", " ")}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {r.submitted_at
                    ? new Date(r.submitted_at).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/dbs/${r.id}`}
                    className="text-teal-700 hover:underline font-medium"
                  >
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
