import type { ReactNode } from "react";

export default function LegalTable({ children }: { children: ReactNode }) {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-slate-50">{children}</thead>;
}

export function TH({ children }: { children: ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-semibold text-slate-700">
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100 bg-white">{children}</tbody>;
}

export function TR({ children }: { children: ReactNode }) {
  return <tr>{children}</tr>;
}

export function TD({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2 align-top text-slate-700">{children}</td>;
}
